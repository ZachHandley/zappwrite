// import type { APIRoute } from 'astro';
// import { createImageTransformer } from './image-utils.js';

// export const GET: APIRoute = async ({ params, request }) => {
//   const url = new URL(request.url);
//   const fileId = params.path;
//   const options = Object.fromEntries(url.searchParams);

//   if (!fileId) {
//     return new Response('Not Found', { status: 404 });
//   }

//   // Transform numeric params
//   const transformedOptions = Object.entries(options).reduce((acc, [key, value]) => {
//     if (['width', 'height', 'quality', 'borderWidth', 'borderRadius', 'opacity', 'rotation']
//         .includes(key)) {
//       acc[key] = parseInt(value);
//     } else {
//       acc[key] = value;
//     }
//     return acc;
//   }, {} as Record<string, string | number>);

//   const imageUrl = createImageTransformer(fileId, transformedOptions);
  
//   // Redirect to the transformed image URL
//   return new Response(null, {
//     status: 302,
//     headers: {
//       'Location': imageUrl,
//       'Cache-Control': 'public, max-age=31536000, immutable'
//     }
//   });
// };