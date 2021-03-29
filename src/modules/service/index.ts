import { CronJob } from "cron";
import { Moment } from "moment";
import { updateJobs } from "../../utils/helpers";
import { JOB_SCHEDULE } from "../../types";
import Cache from "../client/cache";
/**
 *
 * @param time requrie Moment
 * @param runJobNow run job now
 * @param run execute function
 * @param task_id task id
 * @param user_id user id
 * @param cache Cache
 * @param cb execute when the job stops
 */
export const cronExec = (time: Moment, runJobNow: boolean, run: () => void, task_id: string, user_id: string, cache: Cache, tag: "1" | "2" | "3", cb?: () => void) => {
    const cron = new CronJob(time, () => {
            run()
        }, function() {
            // execute when the job stops
            cb && cb();
        },
        runJobNow, // run job now
        'Asia/Jakarta'
    );

    const job: JOB_SCHEDULE = {
        task_id,
        user_id,
        cron,
        date: cron.nextDate()
    };
    const jobs: JOB_SCHEDULE[] = cache.get('cron-jobs');
    try {
        if(jobs) {
            const idx = jobs.findIndex((val => val.user_id === user_id));
            if(idx >= 0) {
                jobs[idx].cron.stop();
                jobs.splice(idx, 1);
                cache.set('cron-jobs', [...jobs, job]);
            } else {
                cache.set('cron-jobs', [...jobs, job]);
            }
        } else {
            cache.set('cron-jobs', [job]);
        }
        updateJobs({time, id: user_id, cache, tag})
    } catch (error) {}
}