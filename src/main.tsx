import HalCache from './core/HalCache'
import axios from 'axios'
import HalClient from './core/HalClient'


try {
  await axios.get('/devapi/login?userId=1', { maxRedirects: 0 })
} catch (e) {
}
axios.interceptors.request.use(config => {
  config.url = config.url?.replace(/8080/g, '3000')
  return config
})

const hal = await HalCache.load(axios, '/api')

console.log(hal);

(window as any).hal = new HalClient(axios, hal)
