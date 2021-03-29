import fs from 'fs/promises'
let cache = new Map<string, any>()
export default class Cache {
    constructor(c?: Map<string, any>) {
        cache = c || cache
        this.log = this.log.bind(this)
        this.has = this.has.bind(this)
        this.set = this.set.bind(this)
        this.get = this.get.bind(this)
    }

    public has(key: string): boolean {
        return cache.has(key)
    }

    public set(key: string, value: any) {
        this.log(key, value)
        return cache.set(key, value)
    }

    public get(key: string) {
        return cache.get(key)
    }

    public delete(key: string): boolean {
        return cache.delete(key)
    }

    public async log(name: string, data: any) {
        var customePath = name.replace('/', '')
        // console.log(name)
        var json = JSON.stringify(data)
        try {
            await fs.writeFile(__dirname+'/'+customePath+'.json', json, 'utf8')
        } catch (error) {
            console.log(error)
        }
    }
}