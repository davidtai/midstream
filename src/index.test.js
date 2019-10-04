import midstream from './index.js';

const defaults = { a: 1, b: 2 }
const middleware = {
  a: (x) => {
    if (x === 1) {
      return x
    }

    throw new Error('a not 1')
  },
  c: (x) => {
    if (x === 3) {
      return x
    }

    throw new Error('c not 3')
  },
}
const dst = { a: 1, b: 2, c: 3 }

describe('midstream', () => {
  it('should construct', () => {
    let { src, err, dst } = midstream(middleware, defaults)

    expect(src).toEqual(defaults)
    expect(err).toEqual({})
    expect(dst).toEqual({})
  });

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
  });

  it('should throw an error when runAll runs an erroring middleware', async () => {
    const _defaults = Object.assign({}, defaults, {
      c: 3,
    })

    let { src, err, dst } = midstream(
      middleware,
      _defaults,
    )

    src.a = 4
    src.c = 5

    let ret
    try {
      await src.runAll()
    } catch (err) {
      ret = err
    }

    expect(ret).toEqual(new Error('a not 1'))
    expect(err).toEqual({
      a: new Error('a not 1'),
      c: new Error('c not 3'),
    })
    expect(dst).toEqual(dst)
  });

  it('should log error eventually', async () => {
    const _defaults = Object.assign({}, defaults, {
      c: 3,
    })

    let { src, err, dst } = midstream(
      middleware,
      _defaults,
    )

    src.a = 4
    src.c = 5

    await new Promise((r) => {
      requestAnimationFrame(() => {
        expect(err).toEqual({
          a: new Error('a not 1'),
          c: new Error('c not 3'),
        })
        expect(dst).toEqual(dst)
        r()
      })
    })
  });
});
