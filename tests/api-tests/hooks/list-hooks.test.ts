import { text } from '@keystone-6/core/fields';
import { list } from '@keystone-6/core';
import { setupTestRunner } from '@keystone-6/api-tests/test-runner';
import { allowAll } from '@keystone-6/core/access';
import { testConfig } from '../utils';

const runner = setupTestRunner({
  config: testConfig({
    lists: {
      User: list({
        access: allowAll,
        fields: {
          name: text({
            hooks: {
              resolveInput: ({ resolvedData }) => {
                if (resolvedData.name === 'trigger field error') {
                  throw new Error('Field error triggered');
                }

                return `${resolvedData.name}-field`;
              },
            },
          }),
        },
        hooks: {
          resolveInput: ({ resolvedData }) => {
            if (resolvedData.name === 'trigger list error-field') {
              throw new Error('List error triggered');
            }
            return {
              name: `${resolvedData.name}-list`,
            };
          },
        },
      }),
    },
  }),
});

describe('List Hooks: #resolveInput()', () => {
  test(
    'resolves fields first, then passes them to the list',
    runner(async ({ context }) => {
      const user = await context.query.User.createOne({ data: { name: 'jess' }, query: 'name' });
      // Field should be executed first, appending `-field`, then the list
      // should be executed which appends `-list`, and finally that total
      // result should be stored.
      expect(user.name).toBe('jess-field-list');
    })
  );

  test(
    'List error',
    runner(async ({ context }) => {
      // Trigger an error
      const { data, errors } = await context.graphql.raw({
        query: `mutation ($data: UserCreateInput!) { createUser(data: $data) { id } }`,
        variables: { data: { name: `trigger list error` } },
      });
      // Returns null and throws an error
      expect(data).toEqual({ createUser: null });
      expect(errors).toMatchSnapshot();
    })
  );

  test(
    'Field error',
    runner(async ({ context }) => {
      // Trigger an error
      const { data, errors } = await context.graphql.raw({
        query: `mutation ($data: UserCreateInput!) { createUser(data: $data) { id } }`,
        variables: { data: { name: `trigger field error` } },
      });
      // Returns null and throws an error
      expect(data).toEqual({ createUser: null });
      expect(errors).toMatchSnapshot();
    })
  );
});
