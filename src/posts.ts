import axios from 'axios';
import { addSpanAttributes } from './telemetry/trace-utils.js';

interface Post {
    id: number;
    title: string;
  }

// export function testSyncFunction() {
//     console.log('THIS IS A SYNC FUNCTION')
//     return "blabla"
// }

const getPostRatings = (post: Post) => { 
    //randomly generate a rating for a post
    const rating = Math.floor(Math.random() * 5) + 1;

    addSpanAttributes({ rating });
    return rating;
}

export async function fetchPosts() {
  const url = 'https://jsonplaceholder.typicode.com/posts?_limit=5';
  addSpanAttributes({ apiUrl: url }, true);

  const response = await axios.get<Post[]>(url);

  addSpanAttributes({
    statusCode: response.status,
    responseLength: response.data.length
  }, true);

  return response.data.map(post => ({
    id: post.id,
    title: post.title.toUpperCase(),
    rating: getPostRatings(post)
  }));
}
