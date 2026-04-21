import { StyleSheet, Text, TextInput, View } from "react-native";

const MIN_CHARS = 50;

type Props = {
  comment: string;
  onChange: (text: string) => void;
};

export default function StepComment({ comment, onChange }: Props) {
  const count = comment.length;
  const isValid = count >= MIN_CHARS;

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        multiline
        placeholder="Décrivez votre expérience..."
        placeholderTextColor="#BBB"
        value={comment}
        onChangeText={onChange}
        textAlignVertical="top"
        maxLength={1000}
        autoFocus
      />
      <Text style={[styles.counter, isValid ? styles.counterOk : styles.counterWarn]}>
        {isValid ? `${count} caractères ✓` : `${count} / ${MIN_CHARS} min`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 4,
  },
  input: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#E5E5E5",
    borderRadius: 14,
    padding: 14,
    fontSize: 15,
    color: "#1a1a1a",
    lineHeight: 22,
  },
  counter: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "500",
    textAlign: "right",
  },
  counterWarn: { color: "#E8472A" },
  counterOk:   { color: "#16A34A" },
});
