/** Explanations shown in the ⓘ tooltips of the encoder settings. Keep in sync with api/dts_api/media.py (plan_encode). */
export const optionHelp = {
  downmix: <>
    <span>How a surround source is folded down to stereo when <b>Layout</b> is 2.0. Stereo and mono sources are not affected.</span>
    <span><b>Lo/Ro</b> — a plain stereo mix: centre and surrounds are blended into left and right. Best for headphones and stereo speakers.</span>
    <span><b>Lt/Rt</b> — matrix-encoded stereo. Sounds like normal stereo, but a Dolby Pro Logic receiver can unfold it back into surround.</span>
    <span><b>None</b> — keeps only front left and right; centre, LFE and surrounds are dropped.</span>
  </>,
  drc: <>
    <span>Narrows the gap between loud and quiet parts before encoding, so quiet passages stay audible at low volume. It is applied to the audio and can't be undone by the player.</span>
    <span><b>None</b> keeps the full dynamics. <b>Film / Music light</b> are gentle, <b>standard</b> is stronger, <b>Speech</b> is the strongest and suits dialogue and voice-over.</span>
  </>,
  limiter: <>
    <span>Keeps peaks below −1 dB so the encode doesn't clip. Downmixing, resampling and DTS encoding can all push peaks above 0 dB.</span>
    <span>Leave it on unless your master is already limited below −1 dB.</span>
  </>,
};
