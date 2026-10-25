import { AudioPlayer, AudioPlayerControlBar, AudioPlayerDurationDisplay, AudioPlayerElement, AudioPlayerMuteButton, AudioPlayerPlayButton, AudioPlayerSeekBackwardButton, AudioPlayerSeekForwardButton, AudioPlayerTimeDisplay, AudioPlayerTimeRange, AudioPlayerVolumeRange } from "@/components/ai-elements/audio-player"

/** A voice, music or sound the app made, played with AI Elements' audio player. */
export function ResultAudio({ src }: { src: string }) {
  return (
    <div className="ai-scope w-full rounded-lg border border-border/60 bg-card p-1.5">
      <AudioPlayer>
        <AudioPlayerElement src={src} />
        <AudioPlayerControlBar>
          <AudioPlayerPlayButton />
          <AudioPlayerSeekBackwardButton seekOffset={10} />
          <AudioPlayerSeekForwardButton seekOffset={10} />
          <AudioPlayerTimeDisplay />
          <AudioPlayerTimeRange />
          <AudioPlayerDurationDisplay />
          <AudioPlayerMuteButton />
          <AudioPlayerVolumeRange />
        </AudioPlayerControlBar>
      </AudioPlayer>
    </div>
  )
}
