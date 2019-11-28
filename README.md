# midstream

> A fully reactive middleware library good for forms or data transforms

## Installing

```sh
npm install midstream@latest
```

## Usage

Import midstream into your application:
```js
import midstream from 'midstream'
```

### V2 API
```javascript
// Import midstream
import midstream from 'midstream'

// Create some middleware that returns the updated value or throws an error

// Validation Example, errors populate both the err and errors return value
const isOdd = (v) => {
  if (v % 2 > 0) {
    return v
  }

  throw new Error('value is not odd')
}

// Data modification middleware example
const to2Decimals = (v) => parseFloat(v).toFixed(2)

// Split on space example
const split = (v) => v.split(/\s+/)

// Asynchronous fetch example
const multiplyByRandom = async (v) => {
  let res = await fetch('https://www.random.org/integers/?num=1&min=1&max=10&format=plain&col=1&base=10')
  let n = await res.text()

  return parseFloat(n) * parseFloat(v)
}

// Initialize a midstream object.
const ms = midstream({
  // Initialize with a map of names to middlewares.
  // The first value in the middleware list is used as default if it is not a function.
  // Values that are set on the src object or by setters flow through the list of
  // middleware functions.
  // The value returned by a middleware is fed into the next middleware as they
  // are automatically composed:
  //   Given middlewares [f(n), g(n)]
  //   Setting a value x results in g(f(x)) being sent to the dst object
  odd: [1, isOdd],
  num: [1, to2Decimals],
  str: ['foo boo', split]
  rnd: [2, multiplyByRandom],
}, {
  // dst is the destination for the result of setting a value.
  // It can be an object or a function:
  // - object - set the object's properties based on the names passed into the
  //   middleware configuration.  Example:
  //     setting `src.x = 1` causes dst.x to be set to the result of 1 being
  //     run through the middleware
  // - function - the function is called with the results of computation
  dst: (name, value) => console.log(`${name}: ${value}`)
})

// The midstream object is composed of several parts:
// - src - the object with all the pre-middleware processed values
// - err - the object containing the first error thrown by each middleware array
// - dst - a reference to the destination object or function passed in
let {
  src,
  err,
  dst,
  odd, setOdd,
  num, setNum,
  str: setStr,
  rnd, setRnd,
  run,
  wait,
} = ms

// Default values are not processed immediately.
// use `await run()` to force a complete refresh of dst data from src data
// use `await wait()` to wait until any ongoing async updates are completed

// There a few ways to set a value:
src.odd = 3
// Output: odd: 3

setOdd(2)
// Output: odd: 3

console.log(dst.odd)
// Output: 3

// odd is not updated because destructing assignment doesn't copy getters.

console.log(odd)
// Output: 1

console.log(ms.odd)
// Output: 3

console.log(src.odd)
// Output: 3

// Errors in middleware are stored in err
src.odd = 2

console.log(err.odd)
// Output: value is not odd

console.log(src.odd)
// Output: 3

console.log(dst.odd)
// Output: 3

// Async callbacks can be awaited if using a setter
(async () => {
  // a setter can be awaited
  await setRnd(20)
  // Output: rnd: 40

  // this form cannot be awaited because js syntax does not support it
  src.rnd = 20

  // wait has to be called
  await wait()
  // Output: rnd: 60

  // call run to run all middleware even on default values
  await run()
  // Output:
  //   odd: 3
  //   num: 1.00
  //   str: ["foo", "boo"]
  //   rnd: 0
})()

while(true)
```

### An Example React Component

```javascript
// import midstream
import midstream from 'midstream'

// Some middleware
const isOdd((v) => {
  if (v % 2 > 0) {
    return v
  }

  throw new Error('value is not odd')
}

// Simple hook for Midstream
const useMidstream = (config) => {
  let dst = {}
  let err = {}

  // standard force rerender hack
  let [tick, setTick] = useState(0)

  let [ms, _] = useState(() => {
    return midstream(config, {
      dst: (name, value) => {
        dst[name] = value
        setTick(tick + 1)
      },
      // err behaves just like dst
      err: (name, value) => {
        err[name] = value
        setTick(tick + 1)
      }
    })
  })

  return [ ms, dst, err ]
}

// Your actual component
(props) => {
  const [ms, dst, err] = useMidstream({ odd: [isOdd] })

  // react call this on every update so odd will be up to date
  const { odd, setOdd } = ms

  return (
    <div>
      <p>Last Odd Number: { dst.odd } </p>
      <input value={odd} onChange={(v) => setOdd(e.target.value) }/>
      { err.odd ? <small>Error: { err.odd }</small> : null }
    </div>)
}
```

### Legacy API:
Create a source, destination, and some error throwing middleware.  Values set to source will populate destination if all
```js
const defaults = { a: 1, b: 2 }

// can take synchronous or asynchronous functions
const middleware = {
  // multiple middleware in array
  a: [(x) => {
    if (x === 1) {
      return x
    }

    throw new Error('a not 1')
  }],
  // singular middleware
  c: async (x) => {
    if (x === 3) {
      return x
    }

    await new Promise ((res, rej) => {
      requestAnimationFrame(() => {
        rej(new Error('c not 3'))
      })
    })
  },
}
const dst = { a: 1, b: 2, c: 3 }

let { src, err, dst } = midstream(
  middleware,
  { defaults },
)

// set values and wait for asynchronous result, even synchronous middleware completes on the next tick
src.a = 4
// await src.run('a', 4) to for the awaitable async setter
src.b = 0
src.c = 5

// optionally await src.run('a', 'optional value overwrite'), src.runAll(), or src.runSettle().
// src.test is like run but will not set any destination values even without error
let ret = await src.runSettle()

console.log(ret)
// {
//   a: {reason: new Error('a not 1'), status: 'rejected'},
//   b: {status: 'fulfilled', value: 0},
//   c: {reason: new Error('c not 3'), status: 'rejected'},
// }

console.log(err)
// {
//   a: new Error('a not 1'),
//   c: new Error('c not 3'),
// }

console.log(dst)
// {
//   a: 1,
//   b: 0,
//   c: 3,
// }

console.log(src)
// {
//   a: 4,
//   b: 0,
//   c: 5,
// }
```

Note: `test`, `run`, `runAll`, and `runSettle` are all functions.

## Running tests

```sh
npm install
npm run test
npm run test --watch
npm run test:coverage
```

## Dev mode

When developing you can run:

```
npm run watch
```

This will regenerate the build files each time a source file is changed and serve on http://127.0.0.1:5000.

## Publishing

```sh
npm publish
```
