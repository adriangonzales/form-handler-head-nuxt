import { describe, expect, it } from 'vitest'
import { parseListQuery, toApiQuery, toRouteQuery } from '../../app/utils/listQuery'

const options = {
  sorts: ['-updated_at', 'name', '-name'],
  defaultSort: '-updated_at',
  filters: { active: ['true', 'false'] },
}

describe('parseListQuery', () => {
  it('uses defaults for an empty query', () => {
    expect(parseListQuery({}, options)).toEqual({
      page: 1,
      perPage: 15,
      sort: '-updated_at',
      filter: {},
    })
  })

  it('reads valid values and ignores invalid ones', () => {
    expect(
      parseListQuery({ page: '3', per_page: '50', sort: 'name', active: 'false' }, options),
    ).toEqual({ page: 3, perPage: 50, sort: 'name', filter: { active: 'false' } })

    expect(
      parseListQuery({ page: '-1', per_page: '7', sort: 'id', active: 'maybe' }, options),
    ).toEqual({ page: 1, perPage: 15, sort: '-updated_at', filter: {} })
  })
})

describe('toRouteQuery', () => {
  it('leaves defaults out of the URL', () => {
    expect(
      toRouteQuery({ page: 1, perPage: 15, sort: '-updated_at', filter: {} }, options),
    ).toEqual({})
    expect(
      toRouteQuery({ page: 2, perPage: 25, sort: 'name', filter: { active: 'true' } }, options),
    ).toEqual({ page: '2', per_page: '25', sort: 'name', active: 'true' })
  })
})

describe('toApiQuery', () => {
  it('maps filters to Laravel filter parameters', () => {
    expect(toApiQuery({ page: 2, perPage: 25, sort: 'name', filter: { active: 'true' } })).toEqual({
      page: 2,
      per_page: 25,
      sort: 'name',
      'filter[active]': 'true',
    })
  })
})
