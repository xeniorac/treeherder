import { slugid } from 'taskcluster-client-web';
import template from 'lodash/template';
import templateSettings from 'lodash/templateSettings';
import jsyaml from 'js-yaml';

import { create } from '../helpers/http';
import {
  getAllUrlParams,
  getAllUrlParamsAsObject,
  getUrlParam,
} from '../helpers/location';
import { createQueryParams, getApiUrl, getProjectUrl } from '../helpers/url';
import taskcluster from '../helpers/taskcluster';
import JobModel from './job';
import TaskclusterModel from './taskcluster';

const MAX_RESULTSET_FETCH_SIZE = 100;
const uri = getApiUrl('/resultset/');

const convertDates = function (locationParams) {
  // support date ranges.  we must convert the strings to a timezone
  // appropriate timestamp
  if ('startdate' in locationParams) {
    locationParams.push_timestamp__gte = Date.parse(locationParams.startdate) / 1000;

    delete locationParams.startdate;
  }
  if ('enddate' in locationParams) {
    locationParams.push_timestamp__lt = Date.parse(locationParams.enddate) / 1000 + 84600;

    delete locationParams.enddate;
  }
  return locationParams;
};

export default class PushModel {
  static getList(options) {
    const urlParams = convertDates(getAllUrlParamsAsObject());
    const repoName = urlParams.repo;
    delete urlParams.repo;
    const params = {
      full: true,
      count: 10,
      ...urlParams,
      ...options,
    };

    if (options.push_timestamp__lte) {
      // we will likely re-fetch the oldest we already have, but
      // that's not guaranteed.  There COULD be two resultsets
      // with the same timestamp, theoretically.
      params.count++;
    }
    if (params.count > MAX_RESULTSET_FETCH_SIZE || urlParams.push_timestamp__gte) {
      // fetch the maximum number of pushes
      params.count = MAX_RESULTSET_FETCH_SIZE;
    }

    return fetch(`${getProjectUrl('/resultset/', repoName)}${createQueryParams(params)}`);
  }

  static get(pk) {
    return fetch(getProjectUrl(`/resultset/${pk}/`, getUrlParam('repo'))).then(resp => resp.json());
  }

  static getJobs(pushId, options = {}) {
    const urlParams = getAllUrlParams();
    const repoName = urlParams.repo;
    delete urlParams.repo;
    const params = {
      result_set_id__in: pushId,
      return_type: 'list',
      count: 2000,
      ...urlParams,
    };

    if ('lastModified' in options) {
      const { lastModified } = options;

      // XXX: should never happen, but maybe sometimes does? see bug 1287501
      if (!(lastModified instanceof Date)) {
        throw Error(`Invalid parameter passed to get job updates: ${lastModified}.  Please reload treeherder`);
      }
      params.last_modified__gt = lastModified.toISOString().replace('Z', '');
    }

    return JobModel.getList(repoName, params, { fetch_all: true });
  }

  // TODO: probably wrong url
  static getRevisions(repoName, pushId) {
    return fetch(getProjectUrl(`${uri}${pushId}/`, repoName))
      .then(resp => resp.json().then(data => (
        data.revisions.length ?
          data.revisions.map(r => r.revision) :
          Promise.reject(`No revisions found for push ${pushId} in project ${repoName}`)
      )));
  }

  // TODO: probably wrong url
  static cancelAll(pushId) {
    return create(`${uri}${pushId}/cancel_all/`);
  }

  static triggerMissingJobs(decisionTaskId, thNotify) {
    const taskclusterModel = new TaskclusterModel(thNotify);

    return taskclusterModel.load(decisionTaskId).then((results) => {
      const actionTaskId = slugid();

      // In this case we have actions.json tasks
      if (results) {
        const missingtask = results.actions.find(
          action => action.name === 'run-missing-tests');

        // We'll fall back to actions.yaml if this isn't true
        if (missingtask) {
          return taskclusterModel.submit({
            action: missingtask,
            actionTaskId,
            decisionTaskId,
            taskId: null,
            task: null,
            input: {},
            staticActionVariables: results.staticActionVariables,
          }).then(() => `Request sent to trigger missing jobs via actions.json (${actionTaskId})`);
        }
      }
    });
  }

  static triggerAllTalosJobs(times, decisionTaskId, thNotify) {
    const taskclusterModel = new TaskclusterModel(thNotify);

    return taskclusterModel.load(decisionTaskId).then((results) => {
      const actionTaskId = slugid();

      // In this case we have actions.json tasks
      if (results) {
        const talostask = results.actions.find(
          action => action.name === 'run-all-talos');

        if (talostask) {
          return taskclusterModel.submit({
            action: talostask,
            actionTaskId,
            decisionTaskId,
            taskId: null,
            task: null,
            input: { times },
            staticActionVariables: results.staticActionVariables,
          }).then(() => (
            `Request sent to trigger all talos jobs ${times} time(s) via actions.json (${actionTaskId})`
          ));
        }
      } else {
        throw Error('Trigger All Talos Jobs no longer supported for this repository.');
      }

      // console.log('trying with actions.yml');
      // // Otherwise we'll figure things out with actions.yml
      // const queue = taskcluster.getQueue();
      // const url = queue.buildUrl(queue.getLatestArtifact, decisionTaskId, 'public/action.yml');
      // return fetch(url).then(resp => resp.text().then((actionTemplate) => {
      //   console.log('actionTemplate', actionTemplate);
      //   templateSettings.interpolate = /{{([\s\S]+?)}}/g;
      //   const compiled = template(actionTemplate);
      //   const action = compiled({
      //     action: 'add-talos',
      //     action_args: `--decision-task-id=${decisionTaskId} --times=${times}`,
      //     decision_task_id: decisionTaskId,
      //     task_labels: 'meh',
      //   });
      //   console.log('actionTemplate for talos jobs', actionTaskId, action);
      //
      //   const task = taskcluster.refreshTimestamps(jsyaml.safeLoad(action));
      //   console.log('task', task);
      //   // return queue.createTask(actionTaskId, task).then(() => (
      //   //   `Request sent to trigger all talos jobs ${times} time(s) via actions.yml (${actionTaskId})`
      //   // ));
      // }));
    });
  }

  static triggerNewJobs(buildernames, decisionTaskId, thNotify) {
    const taskclusterModel = new TaskclusterModel(thNotify);
    const queue = taskcluster.getQueue();
    const url = queue.buildUrl(
      queue.getLatestArtifact,
      decisionTaskId,
      'public/full-task-graph.json',
    );
    return fetch(url).then(resp => resp.json().then((graph) => {
      // Build a mapping of buildbot buildername to taskcluster tasklabel for bbb tasks
      const builderToTask = Object.entries(graph).reduce((currentMap, [key, value]) => {
        if (value && value.task && value.task.payload && value.task.payload.buildername) {
          currentMap[value.task.payload.buildername] = key;
        }
        return currentMap;
      }, {});
      const allLabels = Object.keys(graph);
      const tclabels = [];

      buildernames.forEach(function (name) {
        // The following has 2 cases that it accounts for
        // 1. The name is a taskcluster task label, in which case we pass it on
        // 2. The name is a buildbot buildername _scheduled_ through bbb, in which case we
        //    translate it to the taskcluster label that triggers it.
        name = builderToTask[name] || name;
        if (allLabels.indexOf(name) !== -1) {
          tclabels.push(name);
        }
      });
      if (tclabels.length === 0) {
        throw Error(`No tasks able to run for ${buildernames.join(', ')}`);
      }

      return taskclusterModel.load(decisionTaskId).then((results) => {
        const actionTaskId = slugid();
        // In this case we have actions.json tasks
        if (results) {
          const addjobstask = results.actions.find(action => action.name === 'add-new-jobs');
          // We'll fall back to actions.yaml if this isn't true
          if (addjobstask) {
            return taskclusterModel.submit({
              action: addjobstask,
              actionTaskId,
              decisionTaskId,
              taskId: null,
              task: null,
              input: { tasks: tclabels },
              staticActionVariables: results.staticActionVariables,
            }).then(() => `Request sent to trigger new jobs via actions.json (${actionTaskId})`);
          }
        }

        // TODO: Remove when esr52 is EOL.
        // Otherwise we'll figure things out with actions.yml
        const url = queue.buildUrl(queue.getLatestArtifact, decisionTaskId, 'public/action.yml');
        return fetch(url).then(resp => resp.text().then((actionTemplate) => {

          templateSettings.interpolate = /{{([\s\S]+?)}}/g;
          const compiled = template(actionTemplate);
          const taskLabels = tclabels.join(',');
          const action = compiled({
            decision_task_id: decisionTaskId,
            task_labels: taskLabels,
          });
          const task = taskcluster.refreshTimestamps(jsyaml.safeLoad(action));
          return queue.createTask(actionTaskId, task)
            .then(() => `Request sent to trigger new jobs via actions.yml (${actionTaskId})`);
        }));
      });
    }));
  }
}
