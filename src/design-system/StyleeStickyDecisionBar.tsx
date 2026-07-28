import React from 'react';
import { StyleSheet, View } from 'react-native';
import { StyleeButton } from './StyleeButton';
import { ds, dsShadow } from './tokens';

interface SecondaryAction {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

interface StyleeStickyDecisionBarProps {
  primaryLabel: string;
  onPrimaryPress: () => void;
  state?: 'default' | 'saving' | 'saved';
  secondaryActions?: SecondaryAction[];
}

export function StyleeStickyDecisionBar({
  primaryLabel,
  onPrimaryPress,
  state = 'default',
  secondaryActions = [],
}: StyleeStickyDecisionBarProps) {
  return (
    <View style={styles.root}>
      <StyleeButton
        label={primaryLabel}
        onPress={onPrimaryPress}
        loading={state === 'saving'}
        disabled={state === 'saved'}
        style={[styles.primary, state === 'saved' && styles.saved]}
        labelStyle={state === 'saved' ? styles.savedLabel : undefined}
      />
      {secondaryActions.length > 0 ? (
        <View style={styles.secondaryRow}>
          {secondaryActions.slice(0, 2).map(action => (
            <StyleeButton
              key={action.label}
              label={action.label}
              onPress={action.onPress}
              hierarchy="secondary"
              size="small"
              disabled={action.disabled}
              style={styles.secondary}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: ds.component.stickyDecisionBar.horizontalPadding,
    paddingTop: ds.component.stickyDecisionBar.topPadding,
    paddingBottom: ds.component.stickyDecisionBar.bottomPadding,
    gap: ds.component.stickyDecisionBar.actionGap,
    backgroundColor: ds.color.semantic.surface.floating,
    borderTopWidth: 1,
    borderTopColor: ds.color.semantic.border.subtle,
    ...dsShadow.two,
  },
  primary: {
    width: '100%',
  },
  saved: {
    backgroundColor: ds.color.semantic.status.positive,
    borderColor: ds.color.semantic.status.positive,
  },
  savedLabel: {
    color: ds.color.semantic.text.inverse,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: ds.component.stickyDecisionBar.actionGap,
  },
  secondary: {
    flex: 1,
  },
});
