/* eslint-disable react-hooks/refs */
import { memo, useRef, useEffect } from "react";
import { Warning } from "@phosphor-icons/react";
import renderMarkdown from "@/utils/chat/markdown";
import DOMPurify from "@/utils/chat/purify";
import Citations from "../Citation";
import HistoricalOutputs from "../HistoricalMessage/HistoricalOutputs";
import {
  THOUGHT_REGEX_CLOSE,
  THOUGHT_REGEX_COMPLETE,
  THOUGHT_REGEX_OPEN,
  ThoughtChainComponent,
} from "../ThoughtContainer";

const PromptReply = ({
  uuid,
  reply,
  pending,
  error,
  sources = [],
  outputs = [],
}) => {
  if (!reply && sources.length === 0 && !pending && !error && !outputs?.length)
    return null;

  if (pending) {
    return (
      <div className="flex justify-start w-full">
        <div className="py-4 pl-0 pr-4 flex flex-col md:max-w-[80%]">
          <div className="mt-3 ml-1 dot-falling light:invert"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-start w-full">
        <div className="py-4 pl-0 pr-4 flex flex-col md:max-w-[80%]">
          <span className="inline-block p-2 rounded-lg bg-red-50 text-red-500">
            <Warning className="h-4 w-4 mb-1 inline-block" /> Could not respond
            to message.
            <span className="text-xs">Reason: {error || "unknown"}</span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start w-full">
      <div className="py-4 pl-0 pr-4 flex flex-col w-full">
        <RenderAssistantChatContent message={reply} messageId={uuid} />
        <Citations sources={sources} />
        <HistoricalOutputs outputs={outputs} />
      </div>
    </div>
  );
};

function RenderAssistantChatContent({ message, messageId }) {
  const thoughtChainRef = useRef(null);
  const messageText = message || "";

  const isThinking =
    messageText.match(THOUGHT_REGEX_OPEN) &&
    !messageText.match(THOUGHT_REGEX_CLOSE);

  useEffect(() => {
    if (isThinking && thoughtChainRef.current) {
      thoughtChainRef.current.updateContent(messageText);
    }
  }, [messageText, isThinking]);

  if (isThinking) {
    return (
      <ThoughtChainComponent
        ref={thoughtChainRef}
        content={messageText}
        messageId={messageId}
      />
    );
  }

  let thoughtChain = null;
  let msgToRender = messageText;
  if (messageText.match(THOUGHT_REGEX_COMPLETE)) {
    thoughtChain = messageText.match(THOUGHT_REGEX_COMPLETE)?.[0];
    msgToRender = messageText.replace(THOUGHT_REGEX_COMPLETE, "");
  }

  return (
    <div className="flex flex-col gap-y-1">
      {thoughtChain && (
        <ThoughtChainComponent
          content={thoughtChain}
          messageId={messageId}
        />
      )}
      <div
        className="break-words"
        dangerouslySetInnerHTML={{
          __html: DOMPurify.sanitize(renderMarkdown(msgToRender)),
        }}
      />
    </div>
  );
}

export default memo(PromptReply);
