import React, { forwardRef, useImperativeHandle, useRef } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onFocus?: () => void;
  onClear: () => void;
  isLoading: boolean;
};

export type SearchBarHandle = {
  blur: () => void;
};

const SearchBar = forwardRef<SearchBarHandle, Props>(function SearchBar(
  { value, onChangeText, onFocus, onClear, isLoading },
  ref,
) {
  const inputRef = useRef<TextInput>(null);

  useImperativeHandle(ref, () => ({
    blur: () => inputRef.current?.blur(),
  }));

  return (
    <View style={styles.bar}>
      <Ionicons name="search" size={18} color="#999" style={styles.searchIcon} />

      <TextInput
        ref={inputRef}
        style={styles.input}
        placeholder="Rechercher un restaurant..."
        placeholderTextColor="#aaa"
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="never"
      />

      {isLoading ? (
        <ActivityIndicator
          size="small"
          color="#E8472A"
          style={styles.rightSlot}
        />
      ) : value.length > 0 ? (
        <TouchableOpacity
          onPress={onClear}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.rightSlot}
        >
          <Ionicons name="close-circle" size={18} color="#bbb" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
});

export default SearchBar;

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 11 : 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 5,
  },
  searchIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: "#1a1a1a",
    padding: 0,
  },
  rightSlot: {
    marginLeft: 6,
  },
});
