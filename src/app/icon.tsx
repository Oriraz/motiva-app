import { ImageResponse } from 'next/og';

// הגדרות ריצה
export const runtime = 'edge';

// מימדי האייקון
export const size = {
  width: 192,
  height: 192,
};
export const contentType = 'image/png';

// פונקציית יצירת האייקון
export default function Icon() {
  return new ImageResponse(
    (
      // מיכל חיצוני - רקע לבן ופינות מעוגלות
      <div
        style={{
          background: 'white',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '22%',
        }}
      >
        {/* שימוש בפונט חי במקום ציור ידני */}
        <div
          style={{
            fontSize: 140,         // גודל אופטימלי למילוי הריבוע
            fontWeight: 900,       // המשקל הכי כבד (Black)
            color: 'black',
            fontFamily: 'sans-serif', // פונט ברירת מחדל נקי (לרוב Inter/Roboto/San Francisco)
            
            // תיקונים אופטיים למרכוז האות
            marginTop: -10,        // הרמה קלה למעלה (כי פונטים לפעמים "יושבים" נמוך)
            letterSpacing: -4,     // צמצום רווחים למראה הדוק
          }}
        >
          M
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}