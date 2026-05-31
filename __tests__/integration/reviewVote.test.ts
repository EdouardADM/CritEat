import { renderHook, act } from "@testing-library/react-native";

// Mock du client Supabase : les jest.fn() sont créés DANS la factory, puis
// récupérés via l'import mocké (évite le piège de capture des variables externes).
jest.mock("../../lib/supabase", () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
  },
}));

import { supabase } from "../../lib/supabase";
import { useReviewVote } from "../../hooks/useReviewVote";

const mockGetUser = supabase.auth.getUser as unknown as jest.Mock;
const mockFrom = supabase.from as unknown as jest.Mock;

// Builder chaînable et "thenable" : reproduit .from().delete().eq().eq() et .upsert().
let builder: any;

beforeEach(() => {
  jest.clearAllMocks();
  builder = {
    delete: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    upsert: jest.fn(() => Promise.resolve({ error: null })),
    then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
  };
  mockFrom.mockReturnValue(builder);
  mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
});

describe("useReviewVote.toggleVote", () => {
  it("RETIRE le vote quand on retape le même sens (delete)", async () => {
    const { result } = renderHook(() => useReviewVote());
    let res: unknown;
    await act(async () => {
      res = await result.current.toggleVote("r1", 1, 1);
    });

    expect(mockFrom).toHaveBeenCalledWith("votes");
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.upsert).not.toHaveBeenCalled();
    expect(res).toBeNull();
  });

  it("CHANGE le vote quand on tape le sens opposé (upsert)", async () => {
    const { result } = renderHook(() => useReviewVote());
    let res: unknown;
    await act(async () => {
      res = await result.current.toggleVote("r1", -1, 1);
    });

    expect(builder.upsert).toHaveBeenCalledWith(
      { user_id: "u1", review_id: "r1", value: -1 },
      { onConflict: "user_id,review_id" },
    );
    expect(res).toBe(-1);
  });

  it("CRÉE le vote quand il n'y en avait pas (upsert)", async () => {
    const { result } = renderHook(() => useReviewVote());
    let res: unknown;
    await act(async () => {
      res = await result.current.toggleVote("r1", 1, null);
    });

    expect(builder.upsert).toHaveBeenCalledWith(
      { user_id: "u1", review_id: "r1", value: 1 },
      { onConflict: "user_id,review_id" },
    );
    expect(res).toBe(1);
  });

  it("rejette si l'utilisateur n'est pas authentifié", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { result } = renderHook(() => useReviewVote());

    await expect(
      act(async () => {
        await result.current.toggleVote("r1", 1, null);
      }),
    ).rejects.toThrow();
  });
});
