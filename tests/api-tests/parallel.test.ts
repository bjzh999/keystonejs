import { text } from '@keystone-6/core/fields';
import { list } from '@keystone-6/core';
import { setupTestRunner } from '@keystone-6/api-tests/test-runner';
import { allowAll } from '@keystone-6/core/access';
import { testConfig } from './utils';

const runner = setupTestRunner({
  config: testConfig({
    lists: {
      Post: list({
        access: allowAll,
        fields: {
          title: text(),
        },
      }),
    },
  }),
});

// creating a large number of items can take a while
jest.setTimeout(1000 * 20);

test(
  'creating a lot of items with createOne in parallel',
  runner(async ({ context }) => {
    const data = Array.from({ length: 500 }).map((_, i) => {
      return { title: `Post ${i}` };
    });
    const posts = await Promise.all(
      data.map(data => context.query.Post.createOne({ data, query: 'title' }))
    );
    expect(posts).toEqual(data);
  })
);
test(
  'updating a lot of items with updateOne in parallel',
  runner(async ({ context }) => {
    const data = Array.from({ length: 500 }).map((_, i) => {
      return { title: `Post ${i}` };
    });
    const initialPosts = await context.query.Post.createMany({ data, query: 'id' });
    const posts = await Promise.all(
      initialPosts.map((where, i) =>
        context.query.Post.updateOne({
          where,
          data: { title: `Post ${i} updated` },
          query: 'title',
        })
      )
    );
    expect(posts).toEqual(initialPosts.map((_, i) => ({ title: `Post ${i} updated` })));
  })
);

test(
  'deleting a lot of items with deleteOne in parallel',
  runner(async ({ context }) => {
    const data = Array.from({ length: 500 }).map((_, i) => {
      return { title: `Post ${i}` };
    });
    const initialPosts = await context.query.Post.createMany({ data, query: 'id' });
    const posts = await Promise.all(
      initialPosts.map(where =>
        context.query.Post.deleteOne({
          where,
          query: 'title',
        })
      )
    );
    expect(posts).toEqual(data);
  })
);
