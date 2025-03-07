import { text } from '@keystone-6/core/fields';
import { list } from '@keystone-6/core';
import { setupTestRunner } from '@keystone-6/api-tests/test-runner';
import { allowAll } from '@keystone-6/core/access';
import { ExecutionResult } from 'graphql';
import { testConfig, expectAccessDenied, expectAccessReturnError } from '../utils';

const runner = setupTestRunner({
  config: testConfig({
    lists: {
      User: list({
        access: {
          operation: allowAll,
          filter: {
            query: () => ({
              name: { not: { equals: 'hidden' } },
            }),
            update: () => ({
              name: { not: { equals: 'hidden' } },
            }),
            delete: () => ({
              name: { not: { equals: 'hidden' } },
            }),
          },
          item: {
            create: ({ inputData }) => {
              return inputData.name !== 'bad';
            },
            update: ({ inputData }) => {
              return inputData.name !== 'bad';
            },
            delete: async ({ item }) => {
              return !item.name.startsWith('no delete');
            },
          },
        },

        fields: { name: text() },
      }),
      BadAccess: list({
        access: {
          operation: allowAll,
          // intentionally returns filters for testing purposes
          item: {
            create: () => {
              return { name: { not: { equals: 'bad' } } } as any;
            },
            update: () => {
              return { name: { not: { equals: 'bad' } } } as any;
            },
            delete: async () => {
              return { name: { not: { startsWtih: 'no delete' } } } as any;
            },
          },
        },
        fields: { name: text() },
      }),
    },
  }),
});

describe('Access control - Item', () => {
  test(
    'createOne',
    runner(async ({ context }) => {
      // Valid name should pass
      await context.query.User.createOne({ data: { name: 'good' } });

      // Invalid name
      const { data, errors } = await context.graphql.raw({
        query: `mutation ($data: UserCreateInput!) { createUser(data: $data) { id } }`,
        variables: { data: { name: 'bad' } },
      });

      // Returns null and throws an error
      expect(data).toEqual({ createUser: null });
      expectAccessDenied(errors, [
        {
          path: ['createUser'],
          msg: `You cannot create that User`,
        },
      ]);

      // Only the original user should exist
      const _users = await context.query.User.findMany({ query: 'id name' });
      expect(_users.map(({ name }) => name)).toEqual(['good']);
    })
  );

  test(
    'createOne - Bad function return value',
    runner(async ({ context }) => {
      // Valid name
      const { data, errors } = await context.graphql.raw({
        query: `mutation ($data: BadAccessCreateInput!) { createBadAccess(data: $data) { id } }`,
        variables: { data: { name: 'better' } },
      });

      // Returns null and throws an error
      expect(data).toEqual({ createBadAccess: null });
      expectAccessReturnError(errors, [
        {
          path: ['createBadAccess'],
          errors: [{ tag: 'BadAccess.access.item.create', returned: 'object' }],
        },
      ]);

      // No items should exist
      const _users = await context.query.BadAccess.findMany({ query: 'id name' });
      expect(_users.map(({ name }) => name)).toEqual([]);
    })
  );

  test(
    'updateOne',
    runner(async ({ context }) => {
      // Valid name should pass
      const user = await context.query.User.createOne({ data: { name: 'good' } });
      await context.query.User.updateOne({ where: { id: user.id }, data: { name: 'better' } });

      // Invalid name
      const { data, errors } = await context.graphql.raw({
        query: `mutation ($id: ID! $data: UserUpdateInput!) { updateUser(where: { id: $id }, data: $data) { id } }`,
        variables: { id: user.id, data: { name: 'bad' } },
      });

      // Returns null and throws an error
      expect(data).toEqual({ updateUser: null });
      expectAccessDenied(errors, [
        {
          path: ['updateUser'],
          msg: `You cannot update that User - it may not exist`,
        },
      ]);

      // User should have its original name
      const _users = await context.query.User.findMany({ query: 'id name' });
      expect(_users.map(({ name }) => name)).toEqual(['better']);
    })
  );

  test(
    'updateOne - Missing item',
    runner(async ({ context }) => {
      const user = await context.query.User.createOne({ data: { name: 'hidden' } });
      const { data, errors } = await context.graphql.raw({
        query: `mutation ($id: ID! $data: UserUpdateInput!) { updateUser(where: { id: $id }, data: $data) { id } }`,
        variables: { id: user.id, data: { name: 'something else' } },
      });

      // Returns null and throws an error
      expect(data).toEqual({ updateUser: null });
      expectAccessDenied(errors, [
        {
          path: ['updateUser'],
          msg: `You cannot update that User - it may not exist`,
        },
      ]);

      // should be unchanged
      const userAgain = await context.sudo().db.User.findOne({ where: { id: user.id } });
      expect(userAgain).not.toEqual(null);
      expect(userAgain!.name).toEqual('hidden');
    })
  );

  test(
    'updateOne - Bad function return value',
    runner(async ({ context }) => {
      const item = await context.sudo().query.BadAccess.createOne({ data: { name: 'good' } });

      // Valid name
      const { data, errors } = await context.graphql.raw({
        query: `mutation ($id: ID! $data: BadAccessUpdateInput!) { updateBadAccess(where: { id: $id }, data: $data) { id } }`,
        variables: { id: item.id, data: { name: 'better' } },
      });

      // Returns null and throws an error
      expect(data).toEqual({ updateBadAccess: null });
      expectAccessReturnError(errors, [
        {
          path: ['updateBadAccess'],
          errors: [{ tag: 'BadAccess.access.item.update', returned: 'object' }],
        },
      ]);

      // Item should have its original name
      const _items = await context.query.BadAccess.findMany({ query: 'id name' });
      expect(_items.map(({ name }) => name)).toEqual(['good']);
    })
  );

  test(
    'deleteOne',
    runner(async ({ context }) => {
      // Valid names should pass
      const user1 = await context.query.User.createOne({ data: { name: 'good' } });
      const user2 = await context.query.User.createOne({ data: { name: 'no delete' } });
      await context.query.User.deleteOne({ where: { id: user1.id } });

      // Invalid name
      const { data, errors } = await context.graphql.raw({
        query: `mutation ($id: ID!) { deleteUser(where: { id: $id }) { id } }`,
        variables: { id: user2.id },
      });

      // Returns null and throws an error
      expect(data).toEqual({ deleteUser: null });
      expectAccessDenied(errors, [
        {
          path: ['deleteUser'],
          msg: `You cannot delete that User - it may not exist`,
        },
      ]);

      // Bad users should still be in the database.
      const _users = await context.query.User.findMany({ query: 'id name' });
      expect(_users.map(({ name }) => name)).toEqual(['no delete']);
    })
  );

  test(
    'deleteOne - Bad function return value',
    runner(async ({ context }) => {
      const item = await context.sudo().query.BadAccess.createOne({ data: { name: 'good' } });

      // Valid name
      const { data, errors } = await context.graphql.raw({
        query: `mutation ($id: ID!) { deleteBadAccess(where: { id: $id }) { id } }`,
        variables: { id: item.id },
      });

      // Returns null and throws an error
      expect(data).toEqual({ deleteBadAccess: null });
      expectAccessReturnError(errors, [
        {
          path: ['deleteBadAccess'],
          errors: [{ tag: 'BadAccess.access.item.delete', returned: 'object' }],
        },
      ]);

      // Item should have its original name
      const _items = await context.query.BadAccess.findMany({ query: 'id name' });
      expect(_items.map(({ name }) => name)).toEqual(['good']);
    })
  );

  test(
    'createMany',
    runner(async ({ context }) => {
      // Mix of good and bad names
      const { data, errors } = (await context.graphql.raw({
        query: `mutation ($data: [UserCreateInput!]!) { createUsers(data: $data) { id name } }`,
        variables: {
          data: [
            { name: 'good 1' },
            { name: 'bad' },
            { name: 'good 2' },
            { name: 'bad' },
            { name: 'good 3' },
          ],
        },
      })) as ExecutionResult<any>;

      // Valid users are returned, invalid come back as null
      expect(data).toEqual({
        createUsers: [
          { id: expect.any(String), name: 'good 1' },
          null,
          { id: expect.any(String), name: 'good 2' },
          null,
          { id: expect.any(String), name: 'good 3' },
        ],
      });

      // The invalid updates should have errors which point to the nulls in their path
      expectAccessDenied(errors, [
        {
          path: ['createUsers', 1],
          msg: `You cannot create that User`,
        },
        {
          path: ['createUsers', 3],
          msg: `You cannot create that User`,
        },
      ]);

      // The good users should exist in the database
      const users = await context.query.User.findMany();
      // the ordering isn't consistent so we order them ourselves here
      expect(users.map(x => x.id).sort()).toEqual(
        [data!.createUsers[0].id, data!.createUsers[2].id, data!.createUsers[4].id].sort()
      );
    })
  );

  test(
    'updateMany',
    runner(async ({ context }) => {
      // Start with some users
      const users = await context.query.User.createMany({
        data: [
          { name: 'good 1' },
          { name: 'good 2' },
          { name: 'good 3' },
          { name: 'good 4' },
          { name: 'good 5' },
        ],
        query: 'id name',
      });

      // Mix of good and bad names
      const { data, errors } = await context.graphql.raw({
        query: `mutation ($data: [UserUpdateArgs!]!) { updateUsers(data: $data) { id name } }`,
        variables: {
          data: [
            { where: { id: users[0].id }, data: { name: 'still good 1' } },
            { where: { id: users[1].id }, data: { name: 'bad' } },
            { where: { id: users[2].id }, data: { name: 'still good 3' } },
            { where: { id: users[3].id }, data: { name: 'bad' } },
          ],
        },
      });

      // Valid users are returned, invalid come back as null
      expect(data!).toEqual({
        updateUsers: [
          { id: users[0].id, name: 'still good 1' },
          null,
          { id: users[2].id, name: 'still good 3' },
          null,
        ],
      });

      // The invalid updates should have errors which point to the nulls in their path
      expectAccessDenied(errors, [
        {
          path: ['updateUsers', 1],
          msg: `You cannot update that User - it may not exist`,
        },
        {
          path: ['updateUsers', 3],
          msg: `You cannot update that User - it may not exist`,
        },
      ]);

      // All users should still exist in the database
      const _users = await context.query.User.findMany({
        orderBy: { name: 'asc' },
        query: 'id name',
      });
      expect(_users.map(({ name }) => name)).toEqual([
        'good 2',
        'good 4',
        'good 5',
        'still good 1',
        'still good 3',
      ]);
    })
  );

  test(
    'deleteMany',
    runner(async ({ context }) => {
      // Start with some users
      const users = await context.query.User.createMany({
        data: [
          { name: 'good 1' },
          { name: 'no delete 1' },
          { name: 'good 3' },
          { name: 'no delete 2' },
          { name: 'good 5' },
        ],
        query: 'id name',
      });

      // Mix of good and bad names
      const { data, errors } = await context.graphql.raw({
        query: `mutation ($where: [UserWhereUniqueInput!]!) { deleteUsers(where: $where) { id name } }`,
        variables: {
          where: [users[0].id, users[1].id, users[2].id, users[3].id].map(id => ({ id })),
        },
      });

      // Valid users are returned, invalid come back as null
      expect(data!).toEqual({
        deleteUsers: [
          { id: users[0].id, name: 'good 1' },
          null,
          { id: users[2].id, name: 'good 3' },
          null,
        ],
      });

      // The invalid updates should have errors which point to the nulls in their path
      expectAccessDenied(errors, [
        {
          path: ['deleteUsers', 1],
          msg: `You cannot delete that User - it may not exist`,
        },
        {
          path: ['deleteUsers', 3],
          msg: `You cannot delete that User - it may not exist`,
        },
      ]);

      const _users = await context.query.User.findMany({
        orderBy: { name: 'asc' },
        query: 'id name',
      });
      expect(_users.map(({ name }) => name)).toEqual(['good 5', 'no delete 1', 'no delete 2']);
    })
  );
});
