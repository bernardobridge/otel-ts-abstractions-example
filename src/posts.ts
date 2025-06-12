import axios from 'axios';
import { addSpanAttributes } from './telemetry/trace-utils.js';

interface Post {
    id: number;
    title: string;
  }

export function testSyncFunction() {
    console.log('THIS IS A SYNC FUNCTION')
    return "blabla"
}

export async function fetchPosts() {
  const url = 'https://jsonplaceholder.typicode.com/posts?_limit=5';
  addSpanAttributes({ apiUrl: url }, true);

  const response = await axios.get<Post[]>(url);

  addSpanAttributes({
    statusCode: response.status,
    responseLength: response.data.length
  }, true);

  testSyncFunction()

  return response.data.map(post => ({
    id: post.id,
    title: post.title.toUpperCase()
  }));
}
