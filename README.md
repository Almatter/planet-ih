# Planet IH

Planet IH is a browser multiplayer prototype for [Isekai Hell](https://github.com/Almatter/IsekaiHell). Up to eight players can meet on a shared 2D field. Each player gets a distinct name and block color. Use WASD, the arrow keys, or the on-screen direction pad to move.

## Join a room

1. On the game page, enter a display name and choose **Host room**, then **Create invite**.
2. Send the invite link privately to one friend. They open it in their browser, enter a name, and select **Generate reply**.
3. Have them send the reply code back. Paste it into the host page and choose **Connect guest**.
4. Create a fresh invite for each additional friend. Keep the host tab open for the life of the room. On a phone, open the invite in Safari or Chrome and return to the game after sending the reply.

## Run locally

From this folder, start a static HTTP server and open [the local game](http://localhost:8000/). Two or three tabs on the same computer can test the invite flow. For a phone or another device, use the published HTTPS URL so both devices can open the same page.

```sh
python -m http.server 8000 --bind 127.0.0.1
```

## Publish on GitHub Pages

Push the files to a public `Almatter/planet-ih` repository. In **Settings → Pages**, select **Deploy from a branch**, then select the default branch and `/(root)`. The planned project URL is `https://almatter.github.io/planet-ih/`. The app uses relative asset paths and has no build step. [GitHub Pages setup](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## Network limits

The invite and reply carry WebRTC setup data, which can include network addresses. Share them only with the intended player. After the exchange, each guest connects directly to the host’s browser, which distributes the room’s positions. The prototype uses Google’s public STUN endpoint to help find a direct route. Some cellular networks, VPNs, and firewalls require a TURN relay, which is outside this prototype. If a connection fails, try both devices on the same Wi-Fi and generate a fresh invite. [WebRTC peer connections](https://webrtc.org/getting-started/peer-connections)
