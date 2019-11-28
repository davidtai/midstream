import midstream from './index.js'

const defaults = { a: 1, b: 2 }
const middleware = {
  a: (x) => {
    if (x === 1) {
      return x
    }

    throw new Error('a not 1')
  },
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

describe('midstream 1.x legacy tests', () => {
  it('should construct', () => {
    let { src, err, dst, hooks } = midstream(middleware, {defaults})

    expect(src).toEqual(defaults)
    expect(err).toEqual({})
    expect(dst).toEqual({})
    expect(Object.keys(hooks).length).toEqual(3)
  })

  it('should runAll and populate dst', async () => {
    const _defaults = Object.assign({}, defaults, {
      c: 3,
    })

    let { src, err, dst } = midstream(
      middleware,
      { defaults: _defaults },
    )

    await src.runAll()

    expect(src).toEqual(_defaults)
    expect(err).toEqual({})
    expect(dst).toEqual(_defaults)
  })

  it('should runSettle and populate dst', async () => {
    const _defaults = Object.assign({}, defaults, {
      c: 3,
    })

    let { src, err, dst } = midstream(
      middleware,
      { defaults: _defaults },
    )

    await src.runSettle()

    expect(src).toEqual(_defaults)
    expect(err).toEqual({})
    expect(dst).toEqual(dst)
  })

  it('should throw the first error when runAll runs an erroring middleware', async () => {
    const _defaults = Object.assign({}, defaults, {
      c: 3,
    })

    let { src, err, dst } = midstream(
      middleware,
      { defaults: _defaults },
    )

    src.a = 4
    src.b = 0
    src.c = 5

    let ret
    try {
      await src.runAll()
    } catch (err) {
      ret = err
    }

    expect(ret).toEqual(new Error('a not 1'))
    // all synchronous errors
    expect(err).toEqual({
      a: new Error('a not 1'),
    })
    expect(dst).toEqual({
      a: 1,
      b: 0,
      c: 3,
    })
    expect(src).toEqual({
      a: 4,
      b: 0,
      c: 5,
    })
  })

  it('should not throw an error when runSettle runs an erroring middleware, should return all promise results', async () => {
    const _defaults = Object.assign({}, defaults, {
      c: 3,
    })

    let { src, err, dst } = midstream(
      middleware,
      { defaults: _defaults },
    )

    src.a = 4
    src.b = 0
    src.c = 5

    let ret = await src.runSettle()

    expect(ret).toEqual({
      a: {reason: new Error('a not 1'), status: 'rejected'},
      b: {status: 'fulfilled', value: 0},
      c: {reason: new Error('c not 3'), status: 'rejected'},
    })
    // all errors
    expect(err).toEqual({
      a: new Error('a not 1'),
      c: new Error('c not 3'),
    })
    expect(dst).toEqual({
      a: 1,
      b: 0,
      c: 3,
    })
  })

  it('should log error eventually', async () => {
    const _defaults = Object.assign({}, defaults, {
      c: 3,
    })

    let { src, err, dst } = midstream(
      middleware,
      { defaults: _defaults },
    )

    src.a = 4
    src.b = 0
    src.c = 5

    await new Promise((r) => {
      requestAnimationFrame(() => {
        expect(err).toEqual({
          a: new Error('a not 1'),
          c: new Error('c not 3'),
        })
        expect(dst).toEqual({
          a: 1,
          b: 0,
          c: 3,
        })
        r()
      })
    })
  })

  it('should get react style hooks', async () => {
    const _defaults = Object.assign({}, defaults, {
      c: 3,
    })

    let { src, err, dst } = midstream(
      middleware,
      { defaults: _defaults },
    )

    let [c, setC, dstC] = src.hook('c')

    expect(c()).toEqual(3)

    const ret = await setC(4)
    expect(ret).toEqual(new Error('c not 3'))

    expect(c()).toEqual(4)
    expect(dstC()).toEqual(3)

    expect(err).toEqual({
      c: new Error('c not 3'),
    })
    expect(dst).toEqual(dst)
  })

  it('should allow for overwriting of value using return', async () => {
    let defaults = { a: 1 }
    let middleware = {
      a: (x) => {
        return '' + x
      },
    }

    let { src, err, dst } = midstream(
      middleware,
      { defaults },
    )

    src.a = 2

    let ret = await src.runSettle()

    // all errors
    expect(err).toEqual({})
    expect(dst).toEqual({
      a: '2',
    })
  })

  it('should be able to await run', async () => {
    let defaults = { a: 1 }
    let middleware = {
      a: (x) => {
        return '' + x
      },
    }

    let { src, err, dst } = midstream(
      middleware,
      defaults,
    )

    await src.run('a', 2)

    // all errors
    expect(err).toEqual({})
    expect(dst).toEqual({
      a: '2',
    })
  })

  it('should be able to run a chain', async () => {
    let defaults = { a: 1 }
    let middleware = {
      a: [
        (x) => {
          return x + 1
        }, (x) => {
          return '' + x
        }
      ],
    }

    let { src, err, dst } = midstream(
      middleware,
      defaults,
    )

    await src.run('a', 2)

    // all errors
    expect(err).toEqual({})
    expect(dst).toEqual({
      a: '3',
    })
  })
})

describe('midstream 2.x api updates', () => {
  const isEven = function(v) {
    return new Promise((resolve, reject) => {
      requestAnimationFrame(() => {
        if (v % 2 === 0) {
          resolve(v)
          return
        }

        reject(new Error('a not even'))
      })
    })
  }

  it('should construct using the inline api', () => {
    let ms = midstream({
      x: [1],
      y: [2, isEven]
    })

    let { x, setX, y, setY, src, dst, err } = ms

    expect(src).toEqual({ x: 1, y: 2 })
    expect(err).toEqual({})
    expect(dst).toEqual({})
    expect(x).toEqual(1)
    expect(y).toEqual(2)
  })

  fit('hooks should work and allow waiting', async () => {
    let ms = midstream({
      x: [1],
      y: [2, isEven]
    })

    let { x, setX, y, setY, err, dst, waitAll } = ms

    expect(x).toEqual(1)
    expect(y).toEqual(2)

    setX(2)
    setY(4)

    await waitAll()

    // old props should not be up to date
    expect(x).toEqual(1)
    expect(y).toEqual(2)

    // props on ms should be up to date
    expect(ms.x).toEqual(2)
    expect(ms.y).toEqual(4)

    expect(dst.x).toEqual(2)
    expect(dst.y).toEqual(4)
  })

  it('hook period auto renaming should work', async () => {
    let ms = midstream({
      'x.y': [1],
      y: [2, isEven]
    })

    let { xY, setXY, y, setY, err, dst, waitAll } = ms

    expect(xY).toEqual(1)
    expect(y).toEqual(2)

    setXY(2)
    setY(4)

    await wait()

    // old props should not be up to date
    expect(xY).toEqual(1)
    expect(y).toEqual(2)

    // props on ms should be up to date
    expect(ms.xY).toEqual(2)
    expect(ms.y).toEqual(4)

    expect(dst['x.y']).toEqual(2)
    expect(dst.y).toEqual(4)
  })
})

