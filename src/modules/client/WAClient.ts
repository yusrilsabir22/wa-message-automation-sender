import { Socket } from 'socket.io';
import { SOCKET_EVENT } from '../../types';
import { createSession, getSession, handleError, removeSessionFile } from '../../utils/helpers'
import {Client, ClientSession, Message, WAState} from 'whatsapp-web.js'
import QRCode from 'qrcode'
import Cache from './cache';
export default class WAClient {
    client: Client;
    io: Socket;
    id: string;
    cache: Cache
    message: 'Connection'
    constructor(socket: Socket, cache: Cache) {
        this.io = socket;
        this.cache = cache
        this.init = this.init.bind(this);
        this.OnReady = this.OnReady.bind(this);
        this.OnQR = this.OnQR.bind(this);
        this.OnAuthenticated = this.OnAuthenticated.bind(this)
        this.OnAuthenticatedFailure = this.OnAuthenticatedFailure.bind(this)
        this.onDisconnected = this.onDisconnected.bind(this);
        this.onMessage = this.onMessage.bind(this)
        this.getClient = this.getClient.bind(this)
    }
    /**
     *
     * @param name client id
     */
    init = async (name: string) => {
        console.log('initialize user '+name)
        const session = await getSession(name)
        this.client = new Client({
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
        this.id = name;
        this.client.initialize();
        this.client.on("qr", this.OnQR);
        this.client.on("ready", this.OnReady)
        this.client.on("authenticated", this.OnAuthenticated);
        this.client.on("auth_failure", this.OnAuthenticatedFailure);
        this.client.on("disconnected", this.onDisconnected);
        this.client.on("message", this.onMessage);
    }

    resumeSession = async (name: string) => {
        const session = await getSession(name);
        console.log(session)
        this.client = new Client({
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
            session,
            authTimeoutMs: 20000,
            restartOnAuthFail: true
        });
        this.id = name;
        this.client.initialize();
        this.client.on("qr", this.OnQR);
        this.client.on("ready", this.OnReady)
        this.client.on("authenticated", this.OnAuthenticated);
        this.client.on("auth_failure", this.OnAuthenticatedFailure);
        this.client.on("disconnected", this.onDisconnected);
        this.client.on("message", this.onMessage);
    }

    OnQR = (qr: string) => {
        console.log(this.id, 'on scan qr')
        QRCode.toDataURL(qr, (err, url) => {
            if(err) handleError(err);
            this.io.emit(SOCKET_EVENT.qr, { id: this.id, src: url });
            this.io.emit(SOCKET_EVENT.message, { id: this.id, text: 'QR Code received, scan please!' });
        });
    }

    OnAuthenticated = (session: ClientSession) => {
        console.log(this.id, 'on authenticated')
        this.io.emit(SOCKET_EVENT.authenticated, { id: this.id });
        this.io.emit(SOCKET_EVENT.message, { id: this.id, text: 'Whatsapp is authenticated!' });
        createSession(this.id, session);
    }

    OnReady = () => {
        console.log(this.id, 'on ready')
        this.io.emit(SOCKET_EVENT.ready, { id: this.id });
        this.io.emit(SOCKET_EVENT.message, { id: this.id, text: 'Whatsapp is ready!' });
        // getSession(this.id);
        const activeSession: string[] = this.cache.get('active-session') || []
        this.cache.set('active-session', [...activeSession, this.id])
    }

    OnAuthenticatedFailure = (message: string) => {
        this.io.emit('message', { id: this.id, text: 'Auth failure, restarting...', message });
        setTimeout(() => {
            this.init(this.id)
        }, 2000)
    }

    onDisconnected = async (reason: WAState) => {
        console.log(this.id, 'on disconnected')
        this.io.emit('message', { id: this.id, text: 'Whatsapp is disconnected!', message: reason });
        await this.client.destroy();
        this.io.emit('remove-session', this.id);
        await removeSessionFile(this.id);
        this.client.initialize()
        const activeSessions: string[] = this.cache.get('active-session')
        const newActiveSessions = activeSessions.filter((item: string) => item !== this.id)
        this.cache.set('active-session', newActiveSessions);
    }

    onMessage = (message: Message) => {
        console.log(message)
        this.io.emit("message", {id: this.id, text: message.from, body: message.body})
    }

    getClient = () => {
        return this.client
    }
}