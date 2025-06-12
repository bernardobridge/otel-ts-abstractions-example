import express from 'express';
import { fetchPosts } from './posts.js';
import { mainSpanMiddleware } from './telemetry/trace-utils.js';

const app = express();

app.use(mainSpanMiddleware);

app.get('/posts', async (req, res) => {
  const posts = await fetchPosts();
  
  res.json(posts);
});

app.listen(3000, () => {
  console.log('App running at http://localhost:3000');
});
