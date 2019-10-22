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
  constructor(middleware, defaults, dst, err) {
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
    })

    if (isObject(this.__middleware)) {
      for (const prop of Object.keys(this.__middleware)) {
        if (isFunction(this.__middleware[prop])) {
          this.__middleware[prop] = [this.__middleware[prop]]
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
      const newValue = await m(value, lastValue, src, mw)
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

    return src.__err[prop] = err
  }

  // run the middleware for a specific prop, or overwrite with value, return the value or error.
  // Use rethrow to rethrow the error. Returns the value assigned or error.
  async run(prop, value, ignoreErrors) {
    try {
      this.__waitingValues[prop] = value === undefined ? this[prop] : value

      delete this.__err[prop]

      this.__running[prop] = true
      let ret

      while (this.__waitingValues.hasOwnProperty(prop)) {

        const v = this.__waitingValues[prop]

        const p = Source.runMiddleware(this, v === undefined ? this[prop] : v, this.__middleware[prop])
        delete this.__waitingValues[prop]
        const y = await p

        this.__running[prop] = false
        ret = await Source.updateDst(this, prop, y)
      }
      return ret
    } catch (err) {
      this.__running[prop] = false
      const e = await Source.updateErr(this, prop, err)
      if (!ignoreErrors) {
        throw e
      }
      return e
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

    await Promise.all(ps)
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

    return this.__hooks[prop] = [() => this[prop], async (value) => {
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
  const src = new Source(middleware, opts.defaults, opts.dst || opts.destination, opts.err || opts.errors)

  return {
    src,
    dst: src.__dst,
    err: src.__err,
    hooks: src.__hooks,

    source: src,
    destination: src.__dst,
    errors: src.__err,
  }
}

export default midstream
