import { ImageResponse } from 'next/og'

// גודל סטנדרטי לאייקון של אפל
export const size = {
  width: 180,
  height: 180,
}
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      // כאן אנחנו מציירים את הלוגו באמצעות CSS רגיל
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'white',
          // באייפון לא צריך לעגל פינות, המכשיר עושה את זה לבד ("Squircle")
          // אבל ניתן רקע לבן מלא
        }}
      >
        <div
          style={{
            fontSize: 120,
            background: 'white',
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'black',
            fontWeight: 900, // עובי מקסימלי
            fontFamily: 'sans-serif',
          }}
        >
          M
        </div>
      </div>
    ),
    {
      ...size,
    }
  )
}