import { CronJob } from "cron"
import { Moment } from "moment"

export type SESSION_FILE = {
    WABrowserId: string;
    WASecretBundle: string;
    WAToken1: string;
    WAToken2: string;
}

export enum SOCKET_EVENT {
    message = "message",
    ready = "ready",
    authenticated = "authenticated",
    qr = "qr"
}

export type JOB_SCHEDULE = {
    task_id: string;
    user_id: string;
    cron: CronJob;
    date: Moment
}