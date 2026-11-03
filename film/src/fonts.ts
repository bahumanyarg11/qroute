import {cancelRender, continueRender, delayRender, staticFile} from 'remotion';

const handle = delayRender('Loading Inter + JetBrains Mono');

const inter = new FontFace('Inter', `url('${staticFile('inter.woff2')}') format('woff2')`, {
  weight: '100 900',
  style: 'normal',
});
const mono = new FontFace('JetBrains Mono', `url('${staticFile('jbmono.woff2')}') format('woff2')`, {
  weight: '100 800',
  style: 'normal',
});

Promise.all([inter.load(), mono.load()])
  .then((faces) => {
    faces.forEach((f) => document.fonts.add(f));
    return document.fonts.ready;
  })
  .then(() => continueRender(handle))
  .catch((err) => cancelRender(err));
