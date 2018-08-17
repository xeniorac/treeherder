import { slugid } from 'taskcluster-client-web';
import taskcluster from '../helpers/taskcluster';
// import jsyaml from 'js-yaml';

import { create } from '../helpers/http';
import { getAllUrlParams, getUrlParam } from '../helpers/location';
import { createQueryParams, getApiUrl, getProjectUrl } from '../helpers/url';
import JobModel from './job';
import TaskclusterModel from './taskcluster';

const MAX_RESULTSET_FETCH_SIZE = 100;
const uri = getApiUrl('/resultset/');

const convertDates = function (locationParams) {
  // support date ranges.  we must convert the strings to a timezone
  // appropriate timestamp
  if ('startdate' in locationParams) {
    locationParams.push_timestamp__gte = Date.parse(
      locationParams.startdate) / 1000;

    delete locationParams.startdate;
  }
  if ('enddate' in locationParams) {
    locationParams.push_timestamp__lt = Date.parse(
      locationParams.enddate) / 1000 + 84600;

    delete locationParams.enddate;
  }
  return locationParams;
};

// return whether an OLDEST resultset range is set.
const hasLowerRange = function (locationParams) {
  return locationParams.fromchange || locationParams.startdate;
};

export default class PushModel {
  constructor(props) {
    Object.assign(this, props);
  }

  // // used for polling new resultsets after initial load
  // getListFromChange(repoName, revision, locationParams) {
  //   locationParams = convertDates(locationParams);
  //   locationParams = {
  //     ...locationParams,
  //     fromchange: revision,
  //   };
  //
  //   return fetch(getProjectUrl(uri, repoName), { params: locationParams },
  //   );
  // }

  static getList(options) {
    const urlParams = convertDates(getAllUrlParams());
    const repoName = urlParams.repo;
    const params = {
      full: true,
      count: 10,
      ...urlParams,
      ...options,
    };

    delete urlParams.repo;

    // count defaults to 10, but can be no larger than the max.
    if (params.count > MAX_RESULTSET_FETCH_SIZE) {
      params.count = MAX_RESULTSET_FETCH_SIZE;
    }
    if (options.push_timestamp__lte) {
      // we will likely re-fetch the oldest we already have, but
      // that's not guaranteed.  There COULD be two resultsets
      // with the same timestamp, theoretically.
      params.count++;
    }
    if (hasLowerRange(urlParams)) {
      // fetch the maximum number of resultsets if a lower range is specified
      params.count = MAX_RESULTSET_FETCH_SIZE;
    }

    return fetch(`${getProjectUrl('/resultset/', repoName)}${createQueryParams(params)}`);
  }

  // getPushList(repoName, resultSetList, full) {
  //   const params = {
  //     full: full === undefined ? true : full,
  //     offset: 0,
  //     count: resultSetList.length,
  //     id__in: resultSetList.join(),
  //   };
  //   return fetch(`${getProjectUrl(uri, repoName)}${createQueryParams(params)}`);
  // }

  static get(pk) {
    return fetch(getProjectUrl(`/resultset/${pk}/`, getUrlParam('repo'))).then(resp => resp.json());
  }

  static getJobs(pushId, options = {}) {
    // XXX: should never happen, but maybe sometimes does? see bug 1287501
    // if (!angular.isDate(lastModified)) {
    //   alert('Invalid parameter passed to get job updates: ' +
    //           'please reload treeherder');
    //   return;
    // }
    console.log('is this a valid date? How do we verify?', options.lastModified);
    const urlParams = getAllUrlParams();
    const repoName = urlParams.repo;
    delete urlParams.repo;
    const params = {
      result_set_id: pushId,
      return_type: 'list',
      count: 2000,
      ...getAllUrlParams(),
    };

    if ('lastModified' in options) {
      params.last_modified__gt = options.lastModified.toISOString().replace('Z', '');
    }

    return JobModel.getList(repoName, params, { fetch_all: true });
  }

  static getRevisions(repoName, pushId) {
    return fetch(getProjectUrl(`${uri}${pushId}/`, repoName))
      .then(resp => resp.json().then(data => (
        data.revisions.length ?
          data.revisions.map(r => r.revision) :
          Promise.reject(`No revisions found for push ${pushId} in project ${repoName}`)
      )));
  }

  // getPushesFromRevision(repoName, revision) {
  //   return fetch(getProjectUrl(`${uri}?revision=${revision}`, repoName))
  //     .then(resp => resp.json().then(data => (
  //       data.results.length ?
  //         data.results :
  //         Promise.reject(`No results found for revision ${revision} on project ${repoName}`)
  //     )));
  // }

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

  triggerAllTalosJobs(times, decisionTaskId, thNotify) {
    const taskclusterModel = new TaskclusterModel(thNotify);

    return taskclusterModel.load(decisionTaskId).then((results) => {
      const actionTaskId = slugid();

      // In this case we have actions.json tasks
      if (results) {
        const talostask = results.actions.find(
          action => action.name === 'run-all-talos');

        // We'll fall back to actions.yaml if this isn't true
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
      }

      // Otherwise we'll figure things out with actions.yml
      const queue = taskcluster.getQueue();
      const url = queue.buildUrl(queue.getLatestArtifact, decisionTaskId, 'public/action.yml');
      return fetch(url).then(resp => resp.json().then((actionTemplate) => {
        // const template = $interpolate(action);
        console.log('actionTemplate for talos jobs', actionTemplate);

        // TODO: Not sure what we're getting back here, but need to find a way
        // to interpolate the returned template.

        // const action = template({
        //   action: 'add-talos',
        //   action_args: `--decision-task-id=${decisionTaskId} --times=${times}`,
        // });
        // const task = taskcluster.refreshTimestamps(jsyaml.safeLoad(action));
        // return queue.createTask(actionTaskId, task).then(() => (
        //   `Request sent to trigger all talos jobs ${times} time(s) via actions.yml (${actionTaskId})`
        // ));
      }));
    });
  }

  triggerNewJobs(buildernames, decisionTaskId, thNotify) {
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
        return;
      }

      return taskclusterModel.load(decisionTaskId).then((results) => {
        const actionTaskId = slugid();
        // In this case we have actions.json tasks
        if (results) {
          const addjobstask = results.actions.find(action =>
                                                     action.name === 'add-new-jobs');
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

        // Otherwise we'll figure things out with actions.yml
        const url = queue.buildUrl(queue.getLatestArtifact, decisionTaskId, 'public/action.yml');
        return fetch(url).then(resp => resp.json().then((action) => {

          console.log('triggerNewJobs return template', action);
          // TODO: how should I interpolate this template?
          // const template = $interpolate(action);
          // const taskLabels = tclabels.join(',');
          // action = template({
          //                     action: 'add-tasks',
          //                     action_args: `--decision-id=${decisionTaskId} --task-labels=${taskLabels}`,
          //                   });
          // const task = taskcluster.refreshTimestamps(jsyaml.safeLoad(action));
          // return queue.createTask(actionTaskId, task).then(() => `Request sent to trigger new jobs via actions.yml (${actionTaskId})`);
        }));
      });
    }));
  }
}
