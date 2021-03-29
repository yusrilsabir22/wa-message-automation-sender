import fs from 'fs'
import { Moment } from 'moment';
import path from 'path';
import { cronExec } from '../modules/service';
import { Client } from 'whatsapp-web.js';
import Cache from '../modules/client/cache';
import { JOB_SCHEDULE, SESSION_FILE } from '../types'

type CREATE_GET_SESSION_PARAM = (name: string, data: SESSION_FILE) => Promise<string>;

export const readSessionFile = (filePath: string): Promise<string> => {
    return new Promise((resolve, reject) => {

        try {
            const file = fs.readFileSync(path.join(__dirname, '..', 'sessions', filePath), {encoding: "utf8"});
            resolve(file)
        } catch (error) {
            reject(error)
        }
    })
}

export const removeSessionFile = (filePath: string): Promise<boolean> => {
    return new Promise((resolve, reject) => {
        try {
            const filename = filePath.includes('-whatsapp-session.json') && filePath || filePath+"-whatsapp-session.json"
            fs.unlinkSync(path.join(__dirname, '..', 'sessions', filename));
            resolve(true)
        } catch (error) {
            reject(error)
        }
    })
}

export const createSession: CREATE_GET_SESSION_PARAM = (name,data) => {
    return new Promise((resolve, reject) => {
        try {
            fs.writeFileSync(path.join(__dirname, '..', 'sessions', name+"-whatsapp-session.json"), JSON.stringify(data))
            resolve(name)
        } catch (error) {
            reject(error)
        }
    })
}

/**
 *
 * @param name file name in directory session
 * @param create generate session file if null
 * @param data data must be set if param create is true
 */
export const getSession = (name: string): Promise<SESSION_FILE | undefined> => {
    /**
     * -whatsapp-session.json is prefix for session file
     */
    let fileSession = name+'-whatsapp-session.json';
    return new Promise(async (resolve) => {
        if(fs.existsSync(path.join(__dirname, '..', 'sessions', fileSession))) {
            const file = await readSessionFile(fileSession);
            resolve(JSON.parse(file))
        } else {
            resolve(undefined)
        }
    })
}

export const getSessions = (): Promise<string[] | undefined> => {
    return new Promise(async (resolve) => {
        const files = fs.readdirSync(path.join(__dirname, '..', 'sessions'));
        if(files) {

            resolve(files)
        } else {
            resolve(undefined)
        }
    })
}

export const updateJobs = (job: {time: Moment; id: string, cache: Cache, tag: "1" | "2" | "3"}) => {
    const filepath = path.join(__dirname, '..', 'db', 'saved-jobs.json');
    if(fs.existsSync(filepath)) {
        const savedJobs: {time: Moment; id: string; tag: "1" | "2" | "3"}[] = JSON.parse(fs.readFileSync(filepath, {encoding: "utf-8"}))
        const idx = savedJobs.findIndex((item) => item.id === job.id);
        if(idx >= 0) {
            savedJobs.splice(idx, 1);
            savedJobs.push({time: job.time, id: job.id, tag: job.tag});
            fs.writeFileSync(filepath, JSON.stringify(savedJobs))
            return
        }
        savedJobs.push({time: job.time, id: job.id, tag: job.tag});
        fs.writeFileSync(filepath, JSON.stringify(savedJobs))
        return
    }
    const savedJobs: {time: Moment; id: string; tag: "1" | "2" | "3"}[] = [{
        id: job.id,
        time: job.time,
        tag: job.tag
    }]
    fs.writeFileSync(filepath, JSON.stringify(savedJobs))
}

export const getListJobs = () => {
    const filepath = path.join(__dirname, '..', 'db', 'saved-jobs.json');
    if(fs.existsSync(filepath)) {
        const savedJobs:{time: Moment; id: string; tag: "1" | "2" | "3"}[] = JSON.parse(fs.readFileSync(filepath, {encoding: "utf-8"}));
        return savedJobs;
    } else {
        return []
    }
}

export const deleteJob = (id: string, cache: Cache): Promise<boolean> => {
    return new Promise((resolve, _reject) => {
        const filepath = path.join(__dirname, '..', 'db', 'saved-jobs.json');
        const jobs: JOB_SCHEDULE[] = cache.get('cron-jobs');
        if(fs.existsSync(filepath)) {
            const savedJobs: {time: Moment; id: string;}[] = JSON.parse(fs.readFileSync(filepath, {encoding: "utf-8"}))
            const currSaveJob = savedJobs.findIndex((job) => job.id === id);
            const currCronJob = jobs.findIndex((item) => item.user_id === id);
            if(currSaveJob !== -1 && currCronJob !== -1) {
                jobs[currCronJob].cron.stop();
                jobs.splice(currCronJob, 1);
                savedJobs.splice(currSaveJob, 1);
                cache.set('cron-jobs', [...jobs]);
                fs.writeFileSync(filepath, JSON.stringify(savedJobs))
                resolve(true)
                console.log('success update jobs')
            } else {
                resolve(false)
                console.log(jobs, `current cron job ${currCronJob}`, savedJobs, `current save job ${currSaveJob}`)
            }
        } else {
            resolve(false)
        }
    })
}

export const initJobs = (cache: Cache) => {
    const filepath = path.join(__dirname, '..', 'db', 'saved-jobs.json');
    if(fs.existsSync(filepath)) {
        const savedJobs: {time: Moment; id: string; tag: "1" | "2" | "3"}[] = JSON.parse(fs.readFileSync(filepath, {encoding: "utf-8"}))
        savedJobs.map((job) => {
            cronExec(job.time, true, async () => {
                const session = await getSession(job.id)
                const client = new Client({
                     puppeteer: {
                        headless: true,
                        args: [
                            '--no-sandbox',
                            '--disable-setuid-sandbox',
                            '--disable-dev-shm-usage',
                            '--disable-accelerated-2d-canvas',
                            '--no-first-run',
                            '--no-zygote',
                            '--single-process', // <- this one doesn't works in Windows
                            '--disable-gpu'
                        ]
                    },
                    session
                });
                const dbExample:{tag: "1" | "2" | "3", data: {name: string; phone: string}[]; message: string}[] = JSON.parse(fs.readFileSync(path.join(__dirname, 'db.example.json'), {encoding: "utf-8"}));
                const idx = dbExample.findIndex((val) => val.tag === job.tag);
                if(idx !== 0) {
                    dbExample[idx].data.map((item) => {
                        try {
                            console.log(`sending message to ${item.name}`)
                            sleep(2000).then(async () => {
                                await client.sendMessage(`${item.phone}@c.us`, dbExample[idx].message);
                                console.log(`success message to ${item.name}`)
                            });
                        } catch (error) {
                            console.log(`error send message to ${item.name}`, error);
                            fs.writeFileSync(path.join(__dirname, '..', 'logs', 'errors.logs'), JSON.stringify({...error, message: "Failed send message body: "+ dbExample[idx].message+" ----- to: "+item.phone}), {encoding: "utf-8"});
                        }
                    });
                }
            }, new Date().getTime().toString(), job.id, cache, job.tag)
        })
    }
}

export const handleError = (err: any) => {
    console.log(err)
}

export const sleep = (ms = 5000) => new Promise((resolve) => setTimeout(resolve, ms))