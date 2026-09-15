/**
 * Moonshine STT AudioWorklet Processor
 * Streams raw Float32 mono PCM frames from the Web Audio thread to the main thread
 * with zero UI thread overhead and zero deprecation warnings.
 */
class STTAudioProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input.length > 0 && input[0]) {
      this.port.postMessage(input[0]);
    }
    return true;
  }
}

registerProcessor("stt-audio-processor", STTAudioProcessor);
