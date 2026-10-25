import { registerProfiles } from "../profile"
import { IMAGE_AUDIO_PROFILES } from "./image-audio"
import { SEEDANCE_PROFILES } from "./seedance"
import { VIDEO_PROFILES } from "./video"

registerProfiles(...SEEDANCE_PROFILES, ...VIDEO_PROFILES, ...IMAGE_AUDIO_PROFILES)
