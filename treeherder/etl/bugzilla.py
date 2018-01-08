import logging

import dateutil.parser
from django.conf import settings
from django.core.cache import cache
from django.utils.encoding import smart_text

from treeherder.etl.common import fetch_json
from treeherder.model.models import Bugscache

logger = logging.getLogger(__name__)


def fetch_intermittent_bugs(offset, limit):
    url = settings.BZ_API_URL + '/rest/bug'
    params = {
        'keywords': 'intermittent-failure',
        'chfieldfrom': '-1y',
        'include_fields': ('id,summary,status,resolution,op_sys,cf_crash_signature,'
                           'keywords,last_change_time'),
        'offset': offset,
        'limit': limit,
    }
    response = fetch_json(url, params=params)
    return response.get('bugs', [])


class BzApiBugProcess():

    def run(self):
        bug_list = []

        offset = 0
        limit = 500
        max_summary_length = Bugscache._meta.get_field('summary').max_length

        # Keep querying Bugzilla until there are no more results.
        while True:
            bug_results_chunk = fetch_intermittent_bugs(offset, limit)
            bug_list += bug_results_chunk
            if len(bug_results_chunk) < limit:
                break
            offset += limit

        if bug_list:
            bugs_stored = set(Bugscache.objects.values_list('id', flat=True))
            old_bugs = bugs_stored.difference(set(bug['id']
                                                  for bug in bug_list))
            Bugscache.objects.filter(id__in=old_bugs).delete()

            cache_to_refresh = []
            for bug in bug_list:
                # we currently don't support timezones in treeherder, so
                # just ignore it when importing/updating the bug to avoid
                # a ValueError
                try:
                    bug_summary = bug.get('summary', '')
                    bug, created = Bugscache.objects.update_or_create(
                        id=bug['id'],
                        defaults={
                            'status': bug.get('status', ''),
                            'resolution': bug.get('resolution', ''),
                            'summary': smart_text(
                                bug_summary[:max_summary_length]),
                            'crash_signature': bug.get('cf_crash_signature', ''),
                            'keywords': ",".join(bug['keywords']),
                            'os': bug.get('op_sys', ''),
                            'modified': dateutil.parser.parse(
                                bug['last_change_time'], ignoretz=True)
                        })
                    if created:
                        # We should remove items from the cache keyed off a
                        # search_term that is a substring of this summary.
                        # That way,
                        # the cache is invalidated so it can be recreated.
                        for test_key in cache.iter_keys("tests_*"):
                            test = cache.get(test_key)
                            if test in bug_summary:
                                cache.delete(test_key)
                                cache_to_refresh.append(test_key)

                except Exception as e:
                    logger.error("error inserting bug '%s' into db: %s", bug, e)

            # refresh test bug cache
            for test_name in cache_to_refresh:
                Bugscache.search(test_name)
