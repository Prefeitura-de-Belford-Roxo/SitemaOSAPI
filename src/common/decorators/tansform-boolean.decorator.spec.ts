import { plainToInstance } from 'class-transformer';

const transformMock = jest.fn(
  (
    transformFn: (params: {
      value: unknown;
      obj: unknown;
      key: string;
    }) => unknown,
    options?: object,
  ) => {
    return jest
      .requireActual('class-transformer')
      .Transform(transformFn, options);
  },
);

jest.mock('class-transformer', () => {
  const actual = jest.requireActual('class-transformer');
  return {
    ...actual,
    Transform: (
      transformFn: (params: {
        value: unknown;
        obj: unknown;
        key: string;
      }) => unknown,
      options?: object,
    ) => transformMock(transformFn, options),
  };
});

import {
  TransformBoolean,
  transformBoolean,
} from './transform-boolean.decorator';

describe('transformBoolean', () => {
  it('deve converter strings e booleanos', () => {
    expect(transformBoolean('true')).toBe(true);
    expect(transformBoolean(true)).toBe(true);
    expect(transformBoolean('false')).toBe(false);
    expect(transformBoolean(false)).toBe(false);
    expect(transformBoolean('maybe')).toBe('maybe');
    expect(transformBoolean(1)).toBe(1);
  });
});

describe('TransformBoolean', () => {
  class SampleDTO {
    @TransformBoolean()
    flag?: boolean | string;
  }

  beforeEach(() => {
    transformMock.mockClear();
  });

  it('deve retornar um decorator Transform', () => {
    expect(typeof TransformBoolean()).toBe('function');
  });

  it('deve ler o valor bruto do objeto ao transformar', () => {
    const dto = plainToInstance(SampleDTO, { flag: 'true' });

    expect(dto.flag).toBe(true);
  });

  it('deve converter false a partir do objeto', () => {
    const dto = plainToInstance(SampleDTO, { flag: 'false' });

    expect(dto.flag).toBe(false);
  });

  it('deve usar value quando obj não for um objeto', () => {
    TransformBoolean();

    const transformFn = transformMock.mock.calls.at(-1)?.[0] as (params: {
      value: unknown;
      obj: unknown;
      key: string;
    }) => unknown;

    expect(transformFn({ value: 'true', obj: null, key: 'flag' })).toBe(true);
    expect(transformFn({ value: 'false', obj: 'texto', key: 'flag' })).toBe(
      false,
    );
    expect(
      transformFn({ value: 'x', obj: { flag: 'true' }, key: 'flag' }),
    ).toBe(true);
  });
});
