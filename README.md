# XSAFETY CCTV link

Public HTTPS broadcast/watch pages for a wired webcam. Deploy this repo on Vercel, then paste the watch URL into the XSAFETY mobile app.

Vercel cannot open a USB camera. The webcam computer opens **Broadcast** in a browser and keeps that tab open.

## Deploy on Vercel

1. Import this GitHub repo in Vercel (Root Directory = `.`).
2. Framework: Other. Output directory empty.
3. Deploy. You get `https://your-project.vercel.app`.

Put that URL in the Expo app `.env`:

```
EXPO_PUBLIC_CCTV_RELAY_URL=https://your-project.vercel.app
```

Restart Expo after changing `.env`.

## Use

Use the `.html` URLs (these work even if pretty `/go/CODE` paths 404):

1. On the machine with the wired webcam, open  
   `https://your-project.vercel.app/go.html?room=YOUR-INSTITUTION-CODE`
2. Allow camera, pick the USB webcam, **Go live**, keep the tab open.
3. In XSAFETY, paste  
   `https://your-project.vercel.app/watch.html?room=YOUR-INSTITUTION-CODE`  
   as the institution stream URL.
4. On the phone: Monitor → camera → live feed.

Occupancy only — no facial recognition. Anyone with the watch URL can see the feed while you are broadcasting.
