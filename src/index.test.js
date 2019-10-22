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

describe('midstream', () => {
  it('should construct', () => {
    let { src, err, dst, hooks } = midstream(middleware, defaults)

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
      _defaults,
    )

    await src.runAll()

    expect(src).toEqual(_defaults)
    expect(err).toEqual({})
    expect(dst).toEqual(dst)
  })

  it('should runSettle and populate dst', async () => {
    const _defaults = Object.assign({}, defaults, {
      c: 3,
    })

    let { src, err, dst } = midstream(
      middleware,
      _defaults,
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
      _defaults,
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
      _defaults,
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
      _defaults,
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
      _defaults,
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
      defaults,
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
})
