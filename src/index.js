import { isString, isObject, isFunction } from './utils'

// allSettled Polyfill
if (!Promise.allSettled) {
  Promise.allSettled = promises =>
    Promise.all(
      promises.map((promise, i) =>
        promise
          .then(value => ({
            status: 'fulfilled',
            value,
          }))
          .catch(reason => ({
            status: 'rejected',
            reason,
          }))
      )
    );
}

class Source {
  constructor(middleware, defaults, dst, err, notify) {
    Object.defineProperties(this, {
      __middleware: {
        value: middleware || {},
      },
      __defaults: {
        value: defaults || {},
      },
      __dst: {
        value: dst || {},
      },
      __err: {
        value: err || {},
      },
      __running: {
        value: {},
      },
      __waitingValues: {
        value: {},
      },
      __hooks: {
        value: {},
      },
      __notify: {
        value: notify,
      },
    })

    if (isObject(this.__middleware)) {
      for (const prop of Object.keys(this.__middleware)) {
        if (isFunction(this.__middleware[prop])) {
          this.__middleware[prop] = [this.__middleware[prop]]
          // support for [0, (v) => v] syntax for using the first value as the
          // default
        } else if (!Array.isArray(this.__middleware[prop])) {
          this.__defaults[prop] = this.__middleware[prop]
          this.__middleware[prop] = []
        }

        if (!isFunction(this.__middleware[prop][0])) {
          this.__defaults[prop] = this.__middleware[prop].shift()
        }

        this.prop(prop, undefined, ...this.__middleware[prop])
      }

      for (const prop of Object.keys(this.__defaults)) {
        if (!this.__middleware[prop]) {
          this.prop(prop)
        }
        this[prop] = this.__defaults[prop]
      }
    } else {
      throw new Error('source: middleware must be an object')
    }
  }

  // run a chain of middleware
  static async runMiddleware(src, value, middleware) {
    if (!src) {
      throw new Error('source.runMiddleware: source undefined')
    }

    if (!middleware || !middleware.length) {
      return value
    }

    // clone the middleware because middleware may modified by a middleware
    // (advanced)
    const mw = middleware.slice(0)

    let lastValue = value
    if (isObject(value)) {
      lastValue = Object.assign({}, value)
    }

    for (const m of mw) {
      const newValue = await m.call(src, value, lastValue, src, mw)
      lastValue = value
      value = newValue
    }

    return value
  }

  // update a single prop's destination
  static async updateDst(src, prop, value) {
    if (!src) {
      throw new Error('source.updateDst: source undefined')
    }

    if (!src.__dst) {
      throw new Error('source.updateDst: destination undefined')
    }

    if (isFunction(src.__dst)) {
      return await src.__dst(prop, value)
    }

    return src.__dst[prop] = value
  }

  // update a single prop's error
  static async updateErr(src, prop, err) {
    if (!src) {
      throw new Error('source.updateErr: source undefined')
    }

    if (!src.__err) {
      throw new Error('source.updateErr: errors undefined')
    }

    if (isFunction(src.__err)) {
      return await src.__err(prop, err)
    }

    if (err === undefined) {
      delete src.__err[prop]
      return undefined
    }

    return src.__err[prop] = err
  }

  // wait for all the middleware to complete all runs
  async waitAll() {
    let ps, res
    do {
      res = undefined
      ps = []
      for (let prop in this.__running) {
        ps.push(this.__running[prop])
      }

      try {
        res = await Promise.all(ps)
      } catch (e) {
        return e
      }
    } while(res && res.length > 0)
  }

  // wait for a specific middleware to complete the most current run
  async wait(prop) {
    if (!prop) {
      return await this.waitAll()
    }

    while(this.__running[prop]) {
      try {
        await this.__running[prop]
      } catch (e) {
        return e
      }
    }
  }

  // run the middleware for a specific prop, or overwrite with value, return the value or error.
  // Use rethrow to rethrow the error. Returns the value assigned or error.
  async run(prop, value, ignoreErrors) {
    if (!prop) {
      return await this.runAll()
    }

    try {
      this.__waitingValues[prop] = value === undefined ? this[prop] : value

      let ret

      // just do this at the same time, somewhat of a hack
      Source.updateErr(this, prop, undefined)
      while (this.__waitingValues.hasOwnProperty(prop)) {

        const v = this.__waitingValues[prop]

        const p = Source.runMiddleware(this, v === undefined ? this[prop] : v, this.__middleware[prop])
        this.__running[prop] = p
        delete this.__waitingValues[prop]
        const y = await p

        ret = await Source.updateDst(this, prop, y)
      }

      delete this.__running[prop]
      return ret
    } catch (err) {
      delete this.__running[prop]
      const e = await Source.updateErr(this, prop, err)

      if (ignoreErrors) {
        return e
      }

      throw e
    }
  }

  // runAll calls run for every prop asynchronously and waits until they are
  // finished to return the result or the the first error.
  async runAll() {
    let ps = []
    let result = {}

    for (const prop of Object.keys(this)) {
      ps.push(this.run(prop).then((x) => result[prop] = x ))
    }

    try {
      await Promise.all(ps)
    } catch (e) {
      return e
    }
    return result
  }

  // runSettle calls run for every prop asynchronously and waits until they are
  // finished to return the results of each execution whether valid or error in
  // the form of Promise.settleAll except a map.
  async runSettle() {
    let ps = []
    let props = Object.keys(this)

    for (const prop of props) {
      ps.push(this.run(prop))
    }

    let ret = await Promise.allSettled(ps)

    let result = {}
    for (const k in props) {
      result[props[k]] = ret[k]
    }

    return result
  }

  // test the middleware for a specific prop, return the value or error.  Use
  // setError to save the error and rethrow to rethrow the error.  Returns the value to be assigned or error.
  async test(prop, setError) {
    try {
      return await Source.runMiddleware(this, this[prop], middleware)
    } catch (err) {
      if (setError) {
        await Source.updateErr(this, prop, err)
      }

      throw err
    }
  }

  // prop defines a property named prop with initial value
  // and a asynchronous middleware chain that is executed when prop
  // is set.  It can overwrite existing props.
  prop(prop, initial, ...middleware) {
    if (!isString(prop) && prop !== '') {
      throw new Error(`source.prop: prop is not a string or is ''`)
    }

    this.__middleware[prop] = middleware

    let p

    Object.defineProperties(this, {
      [`_${prop}`]: {
        value: undefined,
        writable: true,
      },
      [prop]: {
        get: () => {
          return this[`_${prop}`]
        },
        set: (x) => {
          if (x === this[`_${prop}`]) {
            return
          }

          this[`_${prop}`] = x
          p = this.run(prop, x, true)
        },
        // act like a normal property
        enumerable: true,
      }
    })

    if (initial !== undefined) {
      this[prop] = initial
    }

    return this.__hooks[prop] = [() => this[prop], (value) => {
      this[prop] = value
      return p
    }, () => this.__dst[prop]]
  }

  // hook gets a React style getter/setter pair for a prop on this
  // object, returns undefined if prop does not exist.
  hook(prop) {
    if (!this.hasOwnProperty(prop)) {
      throw new Error(`source.hook: prop ''${prop}' does not exist`)
    }

    return this.__hooks[prop]
  }

  // returns all the values on source without any member variables
}

const midstream = (middleware, opts = {}) => {
  const src = new Source(middleware, opts.defaults, opts.dst || opts.destination, opts.err || opts.errors, opts.notify)

  const ret = {
    src,
    dst: src.__dst,
    err: src.__err,
    hooks: src.__hooks,
    runAll:  function() { return src.runAll.apply(src, arguments) },
    run:     function() { return src.run.apply(src, arguments) },
    waitAll: function() { return src.waitAll.apply(src, arguments) },
    wait:    function() { return src.wait.apply(src,arguments) },
    source: src,
    destination: src.__dst,
    errors: src.__err,
  }

  for (let prop in src.__hooks) {
    let hook = src.__hooks[prop]
    let hookName = prop.split('.').map(x => x.charAt(0).toUpperCase() + x.substring(1)).join('')

    Object.defineProperty(ret, hookName.charAt(0).toLowerCase() + hookName.substring(1), {
      get: hook[0]
    })

    ret['set' + hookName] = hook[1]
  }

  return ret
}

export default midstream
