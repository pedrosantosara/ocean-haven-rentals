export const supabase = {
  auth: {
    async getSession() {
      return { data: { session: null }, error: null };
    },
    onAuthStateChange(_cb: unknown) {
      return { data: { subscription: { unsubscribe() {} } } };
    },
    async signOut() {
      return { error: null };
    },
    async getUser() {
      return { data: { user: null }, error: null };
    },
  },
  from(_table: string) {
    const chain = {
      select(_fields?: string) {
        return chain;
      },
      eq(_column: string, _value: unknown) {
        return chain;
      },
      order(_column: string, _options?: unknown) {
        return chain;
      },
      limit(_n: number) {
        return chain;
      },
      single() {
        return Promise.resolve({ data: null, error: null });
      },
      insert(_values: unknown) {
        return Promise.resolve({ data: null, error: null });
      },
    };
    return chain;
  },
  functions: {
    async invoke(_name: string, _options?: unknown) {
      return { data: { url: "" }, error: null };
    },
  },
};