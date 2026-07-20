/* eslint-env jest, node */

const {
  tooledStream,
} = require("../../../utils/agents/aibitat/providers/helpers/tooled");

describe("native tool stream diagnostics", () => {
  it("logs partial tool-call progress when the provider stream closes early", async () => {
    const streamError = Object.assign(new Error("Premature close"), {
      code: "ERR_STREAM_PREMATURE_CLOSE",
    });

    async function* brokenStream() {
      yield {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "call_test",
                  function: {
                    name: "quote-calculator",
                    arguments: '{"lines":[',
                  },
                },
              ],
            },
          },
        ],
      };
      yield {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  function: {
                    arguments: '{"quantity":4',
                  },
                },
              ],
            },
          },
        ],
      };
      throw streamError;
    }

    const client = {
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue(brokenStream()),
        },
      },
    };
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      tooledStream(client, "test/model", [], [], null)
    ).rejects.toThrow("Premature close");

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logLine = errorSpy.mock.calls[0][0];
    expect(logLine).toContain("[AIbitat][NativeToolStream] stream_failed");

    const metadata = JSON.parse(logLine.slice(logLine.indexOf("{")));
    expect(metadata).toMatchObject({
      model: "test/model",
      stage: "receive_stream",
      chunkCount: 2,
      errorMessage: "Premature close",
      errorCode: "ERR_STREAM_PREMATURE_CLOSE",
    });
    expect(metadata.toolCalls).toEqual([
      expect.objectContaining({
        name: "quote-calculator",
        argumentChars: 23,
        argumentsLookComplete: false,
      }),
    ]);

    errorSpy.mockRestore();
  });
});
