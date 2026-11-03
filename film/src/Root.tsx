import React from 'react';
import {Composition} from 'remotion';
import {Film} from './Film';

export const RemotionRoot: React.FC = () => (
  <Composition
    id="QRouteFilm"
    component={Film}
    durationInFrames={600}
    fps={30}
    width={1920}
    height={1080}
  />
);
