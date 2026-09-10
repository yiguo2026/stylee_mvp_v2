import React, { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import type { StylePreferenceController } from '@stymobile/api-client';
import type { AccountScope, AccountStamp } from '@stymobile/core';

import {
  ds,
  StyleeChoiceChip,
  StyleeInlineStatus,
  StyleeNavigationBar,
  StyleePageHeader,
  StyleeStickyDecisionBar,
} from '@/design-system';
import { stylePreferenceViewModel } from '@/lib/stylePreferenceViewModel';

export interface StylePreferenceScreenProps {
  mode: 'onboarding' | 'profile';
  controller: StylePreferenceController;
  accountScope: AccountScope;
  onSaved: () => void;
  onSkipped?: () => void;
  onReadFailureBypass?: () => void;
  onBack?: () => void;
}

type ConfirmedOutcome = 'saved' | 'skipped';
type ActionFlight = Readonly<{
  controller: StylePreferenceController;
  stamp: AccountStamp;
}>;

export function StylePreferenceScreen({
  mode,
  controller,
  accountScope,
  onSaved,
  onSkipped,
  onReadFailureBypass,
  onBack,
}: StylePreferenceScreenProps) {
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const mounted = useRef(true);
  const currentController = useRef(controller);
  const actionFlight = useRef<ActionFlight | null>(null);
  currentController.current = controller;
  const stamp = accountScope.capture();
  const expectedAccountId = stamp?.accountId ?? null;
  const view = useMemo(
    () => stylePreferenceViewModel(snapshot, expectedAccountId),
    [expectedAccountId, snapshot],
  );

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (snapshot.phase === 'idle') void controller.load();
  }, [controller, snapshot.phase]);

  const finish = (started: AccountStamp): ConfirmedOutcome | null => {
    if (!mounted.current || currentController.current !== controller || !accountScope.isCurrent(started)) {
      return null;
    }
    const confirmed = controller.getSnapshot();
    if (confirmed.server?.accountId !== started.accountId || confirmed.phase !== 'ready') return null;
    if (confirmed.message === 'preference_saved' && confirmed.server.status === 'selected') return 'saved';
    if (confirmed.message === 'preference_skipped' && confirmed.server.status === 'skipped') return 'skipped';
    return null;
  };

  const runAction = async (
    action: () => Promise<void>,
    navigateOnConfirmation = true,
  ) => {
    const activeFlight = actionFlight.current;
    if (
      activeFlight !== null
      && activeFlight.controller === controller
      && accountScope.isCurrent(activeFlight.stamp)
    ) return;
    const started = accountScope.capture();
    if (started === null) return;
    const flight = Object.freeze({ controller, stamp: started });
    actionFlight.current = flight;
    try {
      await action();
      if (!navigateOnConfirmation) return;
      const outcome = finish(started);
      if (outcome === 'saved') onSaved();
      if (outcome === 'skipped') onSkipped?.();
    } finally {
      if (actionFlight.current === flight) actionFlight.current = null;
    }
  };

  const bypassReadFailure = () => {
    const current = controller.getSnapshot();
    if (
      !mounted.current
      || currentController.current !== controller
      || stamp === null
      || !accountScope.isCurrent(stamp)
      || current.phase !== 'error'
      || current.server !== null
      || current.message !== 'preference_read_failed'
    ) return;
    onReadFailureBypass?.();
  };

  const secondaryActions: Array<Readonly<{
    label: string;
    onPress: () => void;
    disabled?: boolean;
  }>> = [];
  if (view.canRetryRead) {
    secondaryActions.push({
      label: '重新读取',
      onPress: () => { void runAction(() => controller.load(), false); },
    });
    if (
      mode === 'onboarding'
      && onReadFailureBypass
      && snapshot.phase === 'error'
      && snapshot.server === null
    ) {
      secondaryActions.push({ label: '先进入首页', onPress: bypassReadFailure });
    }
  } else if (view.canRetryConfirmation) {
    secondaryActions.push({
      label: '继续确认',
      onPress: () => { void runAction(() => controller.retryConfirmation()); },
    });
  } else if (view.canConfirmConflictOverwrite) {
    secondaryActions.push({
      label: '确认覆盖',
      onPress: () => { void runAction(() => controller.confirmConflictOverwrite()); },
    });
  } else if (mode === 'onboarding' && view.canSkip) {
    secondaryActions.push({
      label: '暂不设置',
      onPress: () => { void runAction(() => controller.skip()); },
      disabled: snapshot.busy,
    });
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.stage}>
        {mode === 'onboarding' ? (
          <StyleePageHeader title="你的风格偏好" />
        ) : (
          <StyleeNavigationBar title="风格偏好" onBack={onBack} />
        )}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.description}>选择你喜欢的风格，让我们更懂你的审美</Text>
          {view.status ? (
            <StyleeInlineStatus tone={view.status.tone}>{view.status.text}</StyleeInlineStatus>
          ) : null}
          {snapshot.phase === 'conflict' && view.confirmedDisplayNames.length > 0 ? (
            <StyleeInlineStatus tone="neutral">
              {`最新已保存：${view.confirmedDisplayNames.join('、')}`}
            </StyleeInlineStatus>
          ) : null}
          {view.removedLegacyCount > 0 ? (
            <StyleeInlineStatus tone="attention">
              {`${view.removedLegacyCount} 项旧风格已不可用，覆盖时会移除`}
            </StyleeInlineStatus>
          ) : null}
          {view.options.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>可选风格</Text>
              <View style={styles.choices}>
                {view.options.map((option) => (
                  <StyleeChoiceChip
                    key={option.tagId}
                    label={option.label}
                    selected={option.selected}
                    disabled={!view.canToggle}
                    onPress={() => controller.toggle(option.tagId)}
                    trailingContent={option.selected ? (
                      <Feather
                        name="check"
                        size={ds.size.icon.xs}
                        color={ds.color.semantic.text.inverse}
                      />
                    ) : null}
                  />
                ))}
              </View>
            </View>
          ) : null}
          {view.legacySelections.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>已保留的旧风格</Text>
              <Text style={styles.support}>可继续保留或移除，不会新增或改名。</Text>
              <View style={styles.choices}>
                {view.legacySelections.map((selection) => (
                  <StyleeChoiceChip
                    key={selection.tagId}
                    label={selection.label}
                    selected={selection.selected}
                    disabled={!view.canToggle}
                    onPress={() => controller.toggle(selection.tagId)}
                    trailingContent={selection.selected ? (
                      <Feather
                        name="check"
                        size={ds.size.icon.xs}
                        color={ds.color.semantic.text.inverse}
                      />
                    ) : null}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>
        <StyleeStickyDecisionBar
          primaryLabel={mode === 'onboarding' ? '保存并继续' : '保存风格偏好'}
          onPrimaryPress={() => { void runAction(() => controller.save()); }}
          primaryDisabled={!view.canSave}
          state={view.decisionState}
          secondaryActions={secondaryActions}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: ds.color.semantic.surface.base,
    alignItems: 'center',
  },
  stage: {
    flex: 1,
    width: '100%',
    maxWidth: ds.layout.contentMaxMobile,
    backgroundColor: ds.color.semantic.surface.base,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: ds.layout.screenPaddingCompact,
    paddingTop: ds.space[4],
    paddingBottom: ds.space[8],
    gap: ds.layout.sectionGap,
  },
  description: {
    ...ds.typography.content,
    color: ds.color.semantic.text.secondary,
  },
  section: {
    gap: ds.space[3],
  },
  sectionTitle: {
    ...ds.typography.heading,
    color: ds.color.semantic.text.primary,
  },
  support: {
    ...ds.typography.support,
    color: ds.color.semantic.text.secondary,
  },
  choices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ds.component.choiceChip.groupGap,
  },
});
