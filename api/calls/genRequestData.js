/**
 * @author Justin Collier <jpcxme@gmail.com>
 * @license MIT
 * @see {@link http://github.com/jpcx/node-kraken-api|GitHub}
 */

'use strict'

const qs = require('qs')
const signRequest = require('./signRequest.js')

/**
 * Generates request data for a given call.
 *
 * @module  API/Calls/genRequestData
 * @param   {Settings~Config}       settings - Execution settings.
 * @param   {Kraken~Method}         method   - Method being called.
 * @param   {Kraken~Options}        options  - Method-specific options.
 * @returns {API~Calls~RequestData} Request data.
 */
module.exports = (settings, method, options) => {
  const nonce = Date.now() * 1000
  const post = qs.stringify({ ...options, nonce })
  const type = (
    settings.privMethods.includes(method)
      ? 'private'
      : settings.pubMethods.includes(method)
        ? 'public'
        : undefined
  )
  if (!type) throw Error('Bad method')
  const path = '/' + settings.version + '/' + type + '/' + method
  const headers = { 'User-Agent': 'Kraken Node.JS API Client' }
  if (settings.secret && type === 'private') {
    const sig = signRequest(settings.secret, nonce, post, path)
    headers['API-Key'] = settings.key
    headers['API-Sign'] = sig
  } else {
    if (type === 'private') throw Error('EAPI:Invalid key').stack
  }
  return {
    options: { hostname: settings.hostname, path, method: 'POST', headers },
    post
  }
}
