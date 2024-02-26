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

export default function Microphone() {
  const { add, remove, first, size, queue } = useQueue<any>([]);
  const [apiKey, setApiKey] = useState<CreateProjectKeyResponse | null>();
  const [connection, setConnection] = useState<LiveClient | null>();
  const [isListening, setListening] = useState(false);
  const [isLoadingKey, setLoadingKey] = useState(true);
  const [isLoading, setLoading] = useState(true);
  const [isProcessing, setProcessing] = useState(false);
  const [micOpen, setMicOpen] = useState(false);
  const [microphone, setMicrophone] = useState<MediaRecorder | null>();
  const [userMedia, setUserMedia] = useState<MediaStream | null>();
  const [captions, setCaptions] = useState<{ [key: number]: { caption: string; timestamp: string } }>({});

  const toggleMicrophone = useCallback(async () => {
    if (microphone && userMedia) {
      setUserMedia(null);
      setMicrophone(null);

      microphone.stop();
    } else {
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
    if (!apiKey) {
      console.log("getting a new api key");
      fetch("/api", { cache: "no-store" })
        .then((res) => res.json())
        .then((object) => {
          if (!("key" in object)) throw new Error("No api key returned");

          setApiKey(object);
          setLoadingKey(false);
        })
        .catch((e) => {
          console.error(e);
        });
    }
  }, [apiKey]);

  useEffect(() => {
    if (apiKey && "key" in apiKey) {
      console.log("connecting to deepgram");
      const deepgram = createClient(apiKey?.key ?? "");
      const connection = deepgram.listen.live({
        model: "nova-2",
        interim_results: true,
        smart_format: false,
        language: "es", 
        vad_events: true,
        

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

      // connection.on(LiveTranscriptionEvents.Transcript, (data) => {
      //   console.log('Transcript data:', data);
      
      //   if (data.is_final) {
      //     // Use the `start` property from the API response
      //     const startSeconds = data.start; // This is the relative start time of the transcription
      //     const formattedTimestamp = new Date(startSeconds * 1000).toISOString().substr(11, 8); // Convert to HH:MM:SS format
      
      //     const words = data.channel.alternatives[0].words;
      //     const captionText = words
      //       .map((word: any) => word.punctuated_word ?? word.word)
      //       .join(" ");
          
      //     if (captionText !== "") {
      //       // Append the new caption with its start time to the array
      //       setCaptions(prevCaptions => [...prevCaptions, { caption: captionText, timestamp: formattedTimestamp }]);
      //     }
      //   }
      // });
      
      connection.on(LiveTranscriptionEvents.Transcript, (data) => {
        console.log('Transcript data:', data);
      
        const startSeconds = data.start;
        const minutes = Math.floor(startSeconds / 60);
        const seconds = Math.floor(startSeconds % 60);
        const formattedTimestamp = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
      
        const words = data.channel.alternatives[0].words;
        const captionText = words
          .map((word: any) => word.punctuated_word ?? word.word)
          .join(" ");
      
        if (captionText !== "") {
          // Update the caption entry with either interim or final caption text
          setCaptions(prevCaptions => ({
            ...prevCaptions,
            [startSeconds]: { caption: captionText, timestamp: formattedTimestamp }
          }));
        }
      });
      
      

      setConnection(connection);
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
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

  if (isLoadingKey)
    return (
      <span className="w-full text-center">Loading temporary API key...</span>
    );
  if (isLoading)
    return <span className="w-full text-center">Loading the app...</span>;

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
                  <div className="mt-20 p-6 text-xl text-center">
                  {Object.entries(captions)
    .sort(([start1], [start2]) => parseFloat(start1) - parseFloat(start2))
    .map(([start, { caption, timestamp }], index) => (
      <div key={start}>
        <span>{timestamp}</span> - <span>{caption}</span>
      </div>
    ))
}
          </div>
      </div>
      <div
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
      </div>
    </div>
  );
}

