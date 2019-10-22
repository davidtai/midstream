# midstream

> A fully reactive middleware library good for forms or data transforms

## Installing

```sh
npm install midstream@latest
```

## Importing

Import midstream into your application:
```js
import midstream from 'midstream'
```

Create a source, destination, and some error throwing middleware.  Values set to source will populate destination if all 
```
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
  _defaults,
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
