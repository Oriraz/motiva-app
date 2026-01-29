import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Motiva AI Coach',
    short_name: 'Motiva',
    description: 'Your intelligent AI fitness coach for longevity and functional strength.',
    start_url: '/',
    display: 'standalone', // מעלים את סרגל הכתובות של הדפדפן
    background_color: '#000000',
    theme_color: '#000000',
    icons: [
      {
        src: '/icon', // מפנה אוטומטית לקובץ icon.png/svg שיצרנו
        sizes: 'any',
        type: 'image/x-icon',
      },
    ],
  };
}