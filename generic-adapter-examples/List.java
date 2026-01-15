package dev.gxlg.multiversion.adapters.java.util;

import java.util.List;
import java.util.function.Function;

public class List {
    public static <T> Function<?, List<T>> wrapper(Function<Object, T> wrapperT) {
        return obj -> ((List<?>) obj).stream().map(wrapperT).toList();
    }

    public static <T> Function<List<T>, ?> unwrapper(Function<T, Object> unwrapperT) {
        return list -> list.stream().map(unwrapperT).toList();
    }
}
