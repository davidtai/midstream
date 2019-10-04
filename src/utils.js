export const isString = (str) => typeof str === 'string' || str instanceof String

export const isObject = (obj) => obj === Object(obj)

export const isFunction = (fn) => typeof fn === 'function'
