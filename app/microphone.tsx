"use client";

import {
  CreateProjectKeyResponse,
  LiveClient,
  LiveTranscriptionEvents,
  createClient,
} from "@deepgram/sdk";
import { useState, useEffect, useCallback } from "react";
import { useQueue } from "@uidotdev/usehooks";
import Dg from "./dg.svg";
import Recording from "./recording.svg";
import Image from "next/image";

/**
 * Component for handling microphone functionality.
 */
export default function Microphone() {
  // Queue state for storing audio data
  const { add, remove, first, size, queue } = useQueue<any>([]);

  // State variables for API key, connection, listening status, loading states, microphone status, and user media
  const [apiKey, setApiKey] = useState<CreateProjectKeyResponse | null>();
  const [connection, setConnection] = useState<LiveClient | null>();
  const [isListening, setListening] = useState(false);
  const [isProcessing, setProcessing] = useState(false);
  const [micOpen, setMicOpen] = useState(false);
  const [microphone, setMicrophone] = useState<MediaRecorder | null>();
  const [userMedia, setUserMedia] = useState<MediaStream | null>();
  const [captions, setCaptions] = useState<Array<{ caption: string; timestamp: string; speaker: string; isFinal: boolean }>>([]);


  /**
   * Toggles the microphone on/off.
   */
  const toggleMicrophone = useCallback(async () => {
    if (microphone && userMedia) {
      // Stop recording and close microphone
      setUserMedia(null);
      setMicrophone(null);
      microphone.stop();
    } else {
      // Start recording and open microphone
      const userMedia = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const microphone = new MediaRecorder(userMedia);
      microphone.start(500);

      microphone.onstart = () => {
        setMicOpen(true);
      };

      microphone.onstop = () => {
        setMicOpen(false);
      };

      microphone.ondataavailable = (e) => {
        add(e.data);
      };

      setUserMedia(userMedia);
      setMicrophone(microphone);
    }
  }, [add, microphone, userMedia]);

  useEffect(() => {
    // Fetch API key
    if (!apiKey) {
      //console.log("getting a new api key");
      fetch("/api", { cache: "no-store" })
        .then((res) => res.json())
        .then((object) => {
          if (!("key" in object)) throw new Error("No api key returned");

          setApiKey(object);
        })
        .catch((e) => {
          console.error(e);
        });
    }
  }, [apiKey]);

  useEffect(() => {
    // Connect to Deepgram API
    if (apiKey && "key" in apiKey) {
      console.log("connecting to deepgram");
      const deepgram = createClient(apiKey?.key ?? "");
      const connection = deepgram.listen.live({
        model: "nova-2",
        interim_results: true,
        smart_format: true,
        language: "es-419",
        vad_events: true,
        diarize: true,

      });

      connection.on(LiveTranscriptionEvents.Open, () => {
        console.log("connection established");
        setListening(true);
      });

      connection.on(LiveTranscriptionEvents.Close, () => {
        console.log("connection closed");
        setListening(false);
        setApiKey(null);
        setConnection(null);
      });

      connection.on(LiveTranscriptionEvents.Transcript, (data) => {
        console.log('Transcript data:', data);
      
        // Assuming `data.channel` exists and has the required properties.
        const alternatives = data.channel.alternatives[0];
        const words = alternatives.words;
      
        // Process only if we have words.
        if (words && words.length > 0) {
          const speaker = words[0].speaker; // Assuming all words in this transcript have the same speaker.
          const startSeconds = words[0].start; // Start time of the first word.
      
          // Format as MM:SS
          const minutes = Math.floor(startSeconds / 60);
          const seconds = Math.floor(startSeconds % 60);
          const formattedTimestamp = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
      
          const captionText = words.map((word: { punctuated_word: any; word: any; }) => word.punctuated_word ?? word.word).join(" ");
      
          if (data.is_final) {
            // Final results: replace interim results with final result
            setCaptions((prevCaptions) => {
              const newCaptions = prevCaptions.map(captionData =>
                captionData.timestamp === formattedTimestamp && captionData.speaker === `Speaker ${speaker}`
                  ? { ...captionData, caption: captionText, isFinal: true }
                  : captionData
              );
      
              // If it's a new final caption (not replacing an interim result), add it to the array
              if (!newCaptions.find(captionData => captionData.timestamp === formattedTimestamp && captionData.speaker === `Speaker ${speaker}`)) {
                newCaptions.push({ caption: captionText, timestamp: formattedTimestamp, speaker: `Speaker ${speaker}`, isFinal: true });
              }
      
              return newCaptions;
            });
          } else {
            // Interim results: add them to the array if not already present
            setCaptions((prevCaptions) => {
              const existingCaptionIndex = prevCaptions.findIndex(captionData => captionData.timestamp === formattedTimestamp && captionData.speaker === `Speaker ${speaker}`);
              if (existingCaptionIndex !== -1 && !prevCaptions[existingCaptionIndex].isFinal) {
                // Update the existing interim caption
                const updatedCaptions = [...prevCaptions];
                updatedCaptions[existingCaptionIndex] = { ...updatedCaptions[existingCaptionIndex], caption: captionText };
                return updatedCaptions;
              } else {
                // Add a new interim caption
                return [...prevCaptions, { caption: captionText, timestamp: formattedTimestamp, speaker: `Speaker ${speaker}`, isFinal: false }];
              }
            });
          }
        }
      }); // Add closing parenthesis and semicolon here

      setConnection(connection);
    }
  }, [apiKey]);

  useEffect(() => {
    // Process the audio queue
    const processQueue = async () => {
      if (size > 0 && !isProcessing) {
        setProcessing(true);

        if (isListening) {
          const blob = first;
          connection?.send(blob);
          remove();
        }

        const waiting = setTimeout(() => {
          clearTimeout(waiting);
          setProcessing(false);
        }, 250);
      }
    };

    processQueue();
  }, [connection, queue, remove, first, size, isProcessing, isListening]);


  // Render the microphone component
  return (
    <div className="w-full relative">
      <div className="mt-10 flex flex-col align-middle items-center">
        {!!userMedia && !!microphone && micOpen ? (
          <Image
            src="/speak.png"
            width="168"
            height="129"
            alt="Deepgram Logo"
            priority
          />
        ) : (
          <Image
            src="/click.png"
            width="168"
            height="129"
            alt="Deepgram Logo"
            priority
          />
        )}

        <button className="w-24 h-24" onClick={() => toggleMicrophone()}>
          <Recording
            width="96"
            height="96"
            className={
              `cursor-pointer` + !!userMedia && !!microphone && micOpen
                ? "fill-red-400 drop-shadow-glowRed"
                : "fill-gray-600"
            }
          />
        </button>
        <div className="transcription-container">
  {captions.map((item, index) => (
    <div key={index} className="transcription-entry">
      <span className="speaker">{item.speaker}</span>
      -
      <span className="timestamp">{item.timestamp}</span>
      - 
      <span className="caption">{item.caption}</span>
    </div>
  ))}
</div>
      </div>
      {/* <div
        className="z-20 text-white flex shrink-0 grow-0 justify-around items-center 
                  fixed bottom-0 right-5 rounded-lg mr-1 mb-5 lg:mr-5 lg:mb-5 xl:mr-10 xl:mb-10 gap-5"
      >
        <span className="text-sm text-gray-400">
          {isListening
            ? "Deepgram connection open!"
            : "Deepgram is connecting..."}
        </span>
        <Dg
          width="30"
          height="30"
          className={
            isListening ? "fill-white drop-shadow-glowBlue" : "fill-gray-600"
          }
        />
      </div> */}
    </div>
  );
}
