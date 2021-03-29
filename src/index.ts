import fs from 'fs';
import Express from 'express'
import Http from 'http'
import IO from 'socket.io'
import path from 'path'
import WAClient from './modules/client/WAClient';
import Cache from './modules/client/cache';
import { Client } from 'whatsapp-web.js';
import { cronExec } from './modules/service';
import moment, { Moment } from 'moment';
import {  deleteJob, getListJobs, getSessions, sleep, updateJobs } from './utils/helpers';

const app = Express();
const cache = new Cache()
app.use(Express.json());
app.use(Express.urlencoded({ extended: true }));

app.use(Express.static(path.join(__dirname, "..", "public"), {dotfiles: 'allow'}));

const server = Http.createServer(app);
const io = IO(server)
io.on('connection', async (socket) => {
    console.log('user connected');
    let LocWAClient: Client;
    let WACL: WAClient = new WAClient(socket, cache);
    const sessions = await getSessions();

    app.get('/job', (_req, res) => {
        const jobs = getListJobs();
        res.json({data: jobs})
    });

    // delete jobs
    app.put('/job', async (req, res) => {
        const id = req.params.id;
        await deleteJob(id, cache);
        const jobs = getListJobs();
        res.json({data: jobs})
    });

    app.post('/job', async (req, res) => {
        const {id, time, tag} = req.body as {id: string; time: Moment; tag: "1" | "2" | "3"};
        try {
            updateJobs({id, time, cache, tag});
            res.json({
                message: 'success to update job'
            })
        } catch (error) {
            console.log(error);
            res.json({message: 'failed'})
        }
    })

    socket.on('check-session', async (data) => {
        if(sessions) {
            let file = sessions.filter(val => val.includes(data.id));
            if(file) {
                const id = file[0].replace('-whatsapp-session.json', '');
                console.log(id)
                await WACL.resumeSession(id);
                socket.emit('init', [{id, description: new Date()}]);
            }
        } else {
            WACL.init(data.id)
        }
        LocWAClient = WACL.getClient()
    });

    socket.on('create-session', async (data) => {
        console.log(data)
        await WACL.init(data.id)
        LocWAClient = WACL.getClient();
    });

    socket.on('send-message', async (data: {to: string; clientMessage: string}) => {
        if(LocWAClient) {
            try {
                await LocWAClient.sendMessage(data.to+'@c.us', data.clientMessage)
                socket.emit('send-message-info', {id: WACL.id, text: 'success send message', body: ''})
            } catch (error) {
                console.log(error)
                socket.emit('send-message-info', {status: 'failed to send message'})
            }
        }
    });

    socket.on('add-cron-jobs', (data: {time: Moment, to: string, message: string; tag: "1" | "2" | "3"}) => {
        const time = moment(data.time);
        try {
            cronExec(time, true,() => {
                try {
                    const dbExample:{tag: "1" | "2" | "3", data: {name: string; phone: string}[]; message: string}[] = JSON.parse(fs.readFileSync(path.join(__dirname, 'utils', 'db.example.json'), {encoding: "utf-8"}));
                    const idx = dbExample.findIndex((val) => val.tag === data.tag);
                    if(idx !== 0) {
                        dbExample[idx].data.map((item) => {
                            try {
                                console.log(`sending message to ${item.name}`)
                                sleep(2000).then(async () => {
                                    await LocWAClient.sendMessage(`${item.phone}@c.us`, dbExample[idx].message);
                                    console.log(`success message to ${item.name}`)
                                });
                            } catch (error) {
                                console.log(`error send message to ${item.name}`, error);
                                fs.writeFileSync(path.join(__dirname, 'logs', 'errors.logs'), JSON.stringify({...error, message: "Failed send message body: "+ dbExample[idx].message+" ----- to: "+item.phone}), {encoding: "utf-8"});
                            }
                        });
                    }
                } catch (error) {
                    fs.writeFileSync(path.join(__dirname, 'logs', 'errors.logs'), JSON.stringify({...error, message: "Failed send message body: "+ data.message+" ----- to: "+data.to}), {encoding: "utf-8"});
                }
            }, new Date().getTime().toString(), '1', cache, data.tag);
        }
        catch (error) {}
    })

    socket.on("disconnect", () => {
        if(LocWAClient) {
            LocWAClient.destroy();
        }
    })
});

server.listen(3000, () => {
    console.log(`server listen at port 3000`)
})