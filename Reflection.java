import org.jetbrains.annotations.Nullable;

@SuppressWarnings({"unused", "DataFlowIssue"})
public class Reflection {
    @Nullable
    public static Object wrap(String i, Object... ignored) { return new Object(); }

    public static void wrapi(String i, Object... ignored) { }

    public static boolean version(String i) { return true; }
}
