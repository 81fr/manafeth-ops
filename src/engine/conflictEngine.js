import {
  WORK_DAYS_AR,
  timesOverlap,
  dateToArabicDay,
  getDatesForGlobalWeek,
  computeCoveredPeriods,
  expandDatesRange,
  dateRangesOverlap,
  isDateInExecutionRange,
  formatDateRangeAr,
} from './dateUtils';

const ACTIVE_EXEC_STATUSES = new Set([
  'تمت الجدولة',
  'بانتظار المراجعة',
  'بانتظار الاستثناء',
  'بانتظار إبداء الرأي',
  'بانتظار الاعتماد',
  'معتمد',
  'معتمد باستثناء',
  'منفذ',
]);

export const CONFLICT_BEHAVIOR_OPTIONS = [
  { value: 'ignore', label: 'لا يدخل في التعارضات', severityLabel: 'لا يوجد تعارض', blocks: false },
  { value: 'advisory', label: 'تنبيه', severityLabel: 'تنبيه فقط', blocks: false },
  { value: 'important', label: 'مهم', severityLabel: 'تنبيه مهم', blocks: false },
  { value: 'actual_conflict', label: 'تعارض فعلي', severityLabel: 'تعارض يحتاج استثناء', blocks: true },
];

export function getPeriodTiming(periods, periodId) {
  const p = (periods || []).find((x) => x.id === periodId);
  if (!p) return { start: '15:50', end: '16:40', name: periodId || '' };
  return {
    start: p.approvedStart || p.startTime || '15:50',
    end: p.approvedEnd || p.endTime || '16:40',
    name: p.name,
  };
}

export function getSlotCoveredPeriodIds(slot, periods) {
  if (Array.isArray(slot?.coveredPeriodIds) && slot.coveredPeriodIds.length > 0) {
    return slot.coveredPeriodIds;
  }
  if (slot?.fromPeriodId || slot?.toPeriodId) {
    return computeCoveredPeriods(periods, slot.fromPeriodId || slot.periodId, slot.toPeriodId || slot.fromPeriodId || slot.periodId)
      .coveredPeriodIds;
  }
  if (slot?.periodId) return [slot.periodId];
  return [];
}

// Expand supervision rows for a given employee into concrete daily time blocks
export function getEmployeeSupervisionBlocks(employeeId, state, { forDisplay = false } = {}) {
  const emp = state.employees.find((e) => e.id === employeeId);
  if (!emp) return [];

  const periodObjMap = Object.fromEntries((state.periods || []).map((p) => [p.id, p]));
  const pRec = getPeriodTiming(state.periods, 'PER_RECEPTION');
  const pAsr = getPeriodTiming(state.periods, 'PER_ASR');
  const pMag = getPeriodTiming(state.periods, 'PER_MAGHRIB');
  const pIsh = getPeriodTiming(state.periods, 'PER_ISHA');
  const pDis = getPeriodTiming(state.periods, 'PER_DISMISSAL');

  const rawBlocks = [];
  const directRows = (state.supervisionDuties || []).filter((sr) => sr.employeeId === employeeId);

  directRows.forEach((sr) => {
    if (forDisplay && sr.showInSchedule === false) return;
    const rowBehavior = sr.enterConflictEngine === false ? 'ignore' : sr.conflictBehavior || 'actual_conflict';
    const recLoc = sr.reception || sr.receptionLocation || sr.floor;
    const asrLoc = sr.asrHall || sr.asrPrayer?.location || sr.floor;
    const asrRow = sr.asrRow || sr.asrPrayer?.row || '-';
    const magPre = sr.maghribPre || sr.maghribPrayer?.prePrayerLocation || asrLoc;
    const magLoc = sr.maghribHall || sr.maghribPrayer?.location || asrLoc;
    const magRow = sr.maghribRow || sr.maghribPrayer?.row || asrRow;
    const ishaPre = sr.ishaPre || sr.ishaPrayer?.prePrayerLocation || magPre;
    const ishaLoc = sr.ishaHall || sr.ishaPrayer?.location || magLoc;
    const ishaRow = sr.ishaRow || sr.ishaPrayer?.row || magRow;
    const disLoc = sr.dismissal || sr.dismissalLocation || sr.floor;
    const busNums = sr.buses || sr.busNumbers || '';

    rawBlocks.push(
      {
        id: `${sr.id}-REC`,
        supervisionId: sr.id,
        type: 'استقبال',
        periodId: 'PER_RECEPTION',
        title: `إشراف استقبال الطلاب (${recLoc})`,
        location: recLoc,
        floor: sr.floor,
        startTime: pRec.start,
        endTime: pRec.end,
        notes: sr.notes,
        source: sr.sourceFile,
        rowBehavior,
      },
      {
        id: `${sr.id}-ASR`,
        supervisionId: sr.id,
        type: 'صلاة',
        periodId: 'PER_ASR',
        title: `إشراف صلاة العصر — ${asrLoc} (صف ${asrRow})`,
        location: asrLoc,
        prayerRow: asrRow,
        floor: sr.floor,
        startTime: pAsr.start,
        endTime: pAsr.end,
        notes: sr.notes,
        source: sr.sourceFile,
        rowBehavior,
      },
      {
        id: `${sr.id}-MAG`,
        supervisionId: sr.id,
        type: 'صلاة',
        periodId: 'PER_MAGHRIB',
        title: `إشراف قبل وأثناء صلاة المغرب — ${magPre} ← ${magLoc} (صف ${magRow})`,
        location: magLoc,
        preLocation: magPre,
        prayerRow: magRow,
        floor: sr.floor,
        startTime: pMag.start,
        endTime: pMag.end,
        notes: sr.notes,
        source: sr.sourceFile,
        rowBehavior,
      },
      {
        id: `${sr.id}-ISH`,
        supervisionId: sr.id,
        type: 'صلاة',
        periodId: 'PER_ISHA',
        title: `إشراف قبل وأثناء صلاة العشاء — ${ishaPre} ← ${ishaLoc} (صف ${ishaRow})`,
        location: ishaLoc,
        preLocation: ishaPre,
        prayerRow: ishaRow,
        floor: sr.floor,
        startTime: pIsh.start,
        endTime: pIsh.end,
        notes: sr.notes,
        source: sr.sourceFile,
        rowBehavior,
      },
      {
        id: `${sr.id}-DIS`,
        supervisionId: sr.id,
        type: 'صرف الطلاب',
        periodId: 'PER_DISMISSAL',
        title: `إشراف صرف الطلاب — ${disLoc}`,
        location: disLoc,
        buses: busNums,
        floor: sr.floor,
        startTime: pDis.start,
        endTime: pDis.end,
        notes: sr.notes,
        source: sr.sourceFile,
        rowBehavior,
      }
    );
  });

  const genOrSysRows = (state.supervisionDuties || []).filter(
    (sr) => sr.generalSupervisorId === employeeId || sr.systemSupervisorId === employeeId
  );
  if (directRows.length === 0 && genOrSysRows.length > 0) {
    const sr0 = genOrSysRows[0];
    if (!(forDisplay && sr0.showInSchedule === false)) {
      const roleLabel = sr0.generalSupervisorId === employeeId ? 'الإشراف العام' : 'مشرف النظام';
      const floor = sr0.floor;
      const rowBehavior = sr0.enterConflictEngine === false ? 'ignore' : sr0.conflictBehavior || 'actual_conflict';
      [
        { code: 'REC', pid: 'PER_RECEPTION', t: `${roleLabel} (${floor}) — استقبال الطلاب`, s: pRec.start, e: pRec.end },
        { code: 'ASR', pid: 'PER_ASR', t: `${roleLabel} (${floor}) — صلاة العصر`, s: pAsr.start, e: pAsr.end },
        { code: 'MAG', pid: 'PER_MAGHRIB', t: `${roleLabel} (${floor}) — صلاة المغرب`, s: pMag.start, e: pMag.end },
        { code: 'ISH', pid: 'PER_ISHA', t: `${roleLabel} (${floor}) — صلاة العشاء`, s: pIsh.start, e: pIsh.end },
        { code: 'DIS', pid: 'PER_DISMISSAL', t: `${roleLabel} (${floor}) — صرف الطلاب والحافلات`, s: pDis.start, e: pDis.end },
      ].forEach((item) => {
        rawBlocks.push({
          id: `SUP-FLR-${employeeId}-${item.code}`,
          supervisionId: `SUP-FLR-${employeeId}`,
          type: 'إشراف',
          periodId: item.pid,
          title: item.t,
          location: floor,
          floor,
          startTime: item.s,
          endTime: item.e,
          notes: 'يبقى مشرفو النظام والإشراف العام حتى دخول/انصراف آخر طالب وفق آلية الإشراف المعتمدة.',
          source: 'جدول الإشراف اليومي ( تحديث 18-10- 2026 م).xlsx.pdf',
          rowBehavior,
        });
      });
    }
  }

  return rawBlocks.filter((b) => {
    const pObj = periodObjMap[b.periodId];
    if (forDisplay && pObj && pObj.showInSchedule === false) return false;
    return true;
  });
}

function getEffectiveWeeklyCommitment(wcm, dateStr, commitmentOverrides = {}) {
  const key = dateStr ? `${wcm.id}__${dateStr}` : null;
  const ov = key ? commitmentOverrides[key] : null;
  if (ov && (ov.cancelledForDate || ov.suspendedForDate)) return null;
  return {
    ...wcm,
    title: wcm.title || wcm.activityTitle || 'نشاط أسبوعي',
    day: ov?.newDay || wcm.day,
    periodId: ov?.newPeriodId || wcm.periodId,
    venueId: ov?.newVenueId !== undefined ? ov.newVenueId : wcm.venueId,
    venueNote: wcm.venueNote || wcm.venueName,
    leadEmployeeId: ov?.newLeadEmployeeId || wcm.leadEmployeeId || wcm.employeeId,
    resolutionNote: ov?.note,
  };
}

// Supports multi-period ranges + start/end clock overlap
export function slotsOverlap(slotA, slotB, periods) {
  const pSetA = new Set(getSlotCoveredPeriodIds(slotA, periods));
  const pListB = getSlotCoveredPeriodIds(slotB, periods);
  for (const pid of pListB) {
    if (pSetA.has(pid)) return true;
  }
  const sA = slotA.startTime || getPeriodTiming(periods, slotA.fromPeriodId || slotA.periodId).start;
  const eA = slotA.endTime || getPeriodTiming(periods, slotA.toPeriodId || slotA.periodId).end;
  const sB = slotB.startTime || getPeriodTiming(periods, slotB.fromPeriodId || slotB.periodId).start;
  const eB = slotB.endTime || getPeriodTiming(periods, slotB.toPeriodId || slotB.periodId).end;
  return timesOverlap(sA, eA, sB, eB);
}

function mapBehaviorToSeverity(behavior, fallbackSeverity = 'تعارض يحتاج استثناء') {
  if (behavior === 'ignore') return { skip: true };
  if (behavior === 'advisory') {
    return { skip: false, severity: 'تنبيه فقط', requiresException: false, behavior: 'advisory' };
  }
  if (behavior === 'important') {
    return { skip: false, severity: 'تنبيه مهم', requiresException: false, behavior: 'important' };
  }
  return {
    skip: false,
    severity: fallbackSeverity,
    requiresException: true,
    behavior: 'actual_conflict',
  };
}

/**
 * Inspects a single execution unit (either Main Program or one Sub-Program)
 */
function inspectSingleUnit(unit, mainCandidate, state) {
  const unitConflicts = [];
  const dateStr = unit.executionDate || mainCandidate.executionDate || '';
  const endDateStr =
    unit.executionEndDate ||
    (unit.subProgramId ? unit.executionDate : mainCandidate.executionEndDate) ||
    dateStr;
  const day = unit.day || dateToArabicDay(dateStr) || mainCandidate.day;
  if (!day && !dateStr) return unitConflicts;

  const coveredDatesList = dateStr
    ? expandDatesRange(dateStr, endDateStr, { workDaysOnly: true })
    : [{ date: '', day }];
  const activeDatesList =
    coveredDatesList.length > 0 ? coveredDatesList : [{ date: dateStr, day: day || 'الأحد' }];
  const coveredDaysSet = new Set(activeDatesList.map((d) => d.day).filter(Boolean));
  const dateRangeDisplay =
    dateStr && endDateStr && endDateStr > dateStr
      ? formatDateRangeAr(dateStr, endDateStr, { compact: true })
      : day || dateStr;

  const rangeInfo = computeCoveredPeriods(
    state.periods,
    unit.fromPeriodId || unit.periodId || 'P1',
    unit.toPeriodId || unit.fromPeriodId || unit.periodId || 'P1'
  );
  const startTime = unit.startTime || rangeInfo.startTime;
  const endTime = unit.endTime || rangeInfo.endTime;
  const candSlot = {
    periodId: rangeInfo.fromPeriodId,
    fromPeriodId: rangeInfo.fromPeriodId,
    toPeriodId: rangeInfo.toPeriodId,
    coveredPeriodIds: rangeInfo.coveredPeriodIds,
    startTime,
    endTime,
  };

  const allEmpIds = Array.from(
    new Set([unit.leadEmployeeId, ...(unit.participatingEmployeeIds || [])].filter(Boolean))
  );
  const targetMode = unit.targetMode || 'scopes';
  const candScopeIds = new Set(
    targetMode === 'students' ? [] : (unit.scopeIds || []).filter(Boolean)
  );
  const candStudentIds = Array.from(
    new Set(targetMode === 'scopes' ? [] : (unit.studentIds || []).filter(Boolean))
  );

  const deptMap = Object.fromEntries((state.departments || []).map((d) => [d.id, d.name]));
  const empMap = Object.fromEntries((state.employees || []).map((e) => [e.id, e.name]));
  const venueMap = Object.fromEntries((state.venues || []).map((v) => [v.id, v.name]));
  const scopeMap = Object.fromEntries((state.scopes || []).map((s) => [s.id, s.name]));
  const studentMap = Object.fromEntries((state.students || []).map((st) => [st.id, st]));
  const ruleMap = Object.fromEntries((state.conflictRules || []).map((r) => [r.code, r]));
  const periodObjMap = Object.fromEntries((state.periods || []).map((p) => [p.id, p]));

  const pushConflict = (code, payload, itemBehaviorOverride = null) => {
    const rule = ruleMap[code];
    if (rule && rule.isActive === false) return;

    const effectiveBehavior =
      itemBehaviorOverride ||
      rule?.conflictBehavior ||
      (payload.requiresException === false ? 'advisory' : 'actual_conflict');

    const beh = mapBehaviorToSeverity(
      effectiveBehavior,
      rule?.severity || payload.defaultSeverity || 'تعارض يحتاج استثناء'
    );
    if (beh.skip) return;

    unitConflicts.push({
      id: `CNF-${unit.subProgramId || 'MAIN'}-${unitConflicts.length + 1}-${code}`,
      code,
      conflictBehavior: beh.behavior,
      severity: beh.severity,
      requiresException: beh.requiresException,
      mainProgramName: mainCandidate.programName || 'البرنامج الرئيسي',
      subProgramId: unit.subProgramId || null,
      subProgramName: unit.subProgramName || null,
      proposedProgram: unit.subProgramName
        ? `${mainCandidate.programName || 'البرنامج'} ↳ ${unit.subProgramName}`
        : mainCandidate.programName || 'البرنامج المقترح',
      day,
      date: dateStr,
      periodName: rangeInfo.combinedLabel,
      coveredPeriodIds: rangeInfo.coveredPeriodIds,
      timeRange: `${startTime} - ${endTime}`,
      ...payload,
    });
  };

  // 1. Fixed Operational Events (Prayers, Meal, Reception, Dismissal) — Respects separate showInSchedule vs conflictBehavior (Req 25-27)
  (state.periods || [])
    .filter((p) => p.category === 'fixed_event')
    .forEach((fp) => {
      if (fp.enterConflictEngine === false || fp.affectsScheduling === false || fp.conflictBehavior === 'ignore') {
        return;
      }
      const fpStart = fp.approvedStart || fp.startTime;
      const fpEnd = fp.approvedEnd || fp.endTime;
      if (candSlot.periodId !== fp.id && timesOverlap(startTime, endTime, fpStart, fpEnd)) {
        pushConflict(
          'fixed_event_conflict',
          {
            typeLabel: 'تداخل مع وقت تشغيلي ثابت',
            existingProgramId: fp.id,
            existingEntityKind: 'fixed_event',
            existingProgram: fp.name,
            existingDepartment: 'التشغيل العام للنادي',
            employeeName: allEmpIds.map((id) => empMap[id]).filter(Boolean).join('، ') || '—',
            scopeName: [...candScopeIds].map((id) => scopeMap[id]).filter(Boolean).join('، ') || 'جميع الطلاب',
            venueName: venueMap[unit.venueId] || '—',
            reason: `الوقت المختار (${startTime} - ${endTime})${unit.subProgramName ? ` في الفقرة الفرعية «${unit.subProgramName}»` : ''} يتداخل مع (${fp.name}: ${fpStart} - ${fpEnd}).`,
            source: fp.sourceTimes?.[0]?.sourceFile || fp.sourceDoc || 'الجدول الزمني للفترات',
            defaultSeverity: 'تعارض يحتاج استثناء',
          },
          fp.conflictBehavior || 'actual_conflict'
        );
      }
    });

  // 2. Supervision Duties for ALL selected employees (respects prayer/period & supervision conflictBehavior)
  allEmpIds.forEach((empId) => {
    const supBlocks = getEmployeeSupervisionBlocks(empId, state);
    supBlocks.forEach((sb) => {
      const pObj = periodObjMap[sb.periodId];
      if (pObj && (pObj.enterConflictEngine === false || pObj.conflictBehavior === 'ignore')) return;
      if (sb.rowBehavior === 'ignore') return;

      if (timesOverlap(startTime, endTime, sb.startTime, sb.endTime) || candSlot.periodId === sb.periodId) {
        const effBeh =
          pObj?.conflictBehavior && pObj.conflictBehavior !== 'actual_conflict'
            ? pObj.conflictBehavior
            : sb.rowBehavior || null;
        pushConflict(
          'supervision_conflict',
          {
            typeLabel: 'تعارض مع مهمة إشراف يومي قائمة',
            existingProgramId: sb.id,
            existingEntityKind: 'supervision',
            existingProgram: sb.title,
            existingDepartment: 'وحدة الإشراف اليومي',
            employeeId: empId,
            employeeName: empMap[empId] || empId,
            scopeName: '—',
            venueName: sb.location,
            reason: `الموظف (${empMap[empId]}) مكلف بمهمة إشراف قائمة: ${sb.title} (${sb.startTime} - ${sb.endTime}).`,
            source: sb.source,
            defaultSeverity: 'تعارض يحتاج استثناء',
          },
          effBeh
        );
      }
    });
  });

  // Prayer Hall venue check (respects prayer conflictBehavior!)
  if (unit.venueId) {
    const vName = venueMap[unit.venueId] || '';
    const isPrayerHall = vName.includes('فوزية') || vName.includes('الصالة الرياضية');
    if (isPrayerHall) {
      ['PER_ASR', 'PER_MAGHRIB', 'PER_ISHA'].forEach((prId) => {
        const pObj = periodObjMap[prId];
        if (pObj && (pObj.enterConflictEngine === false || pObj.conflictBehavior === 'ignore')) return;
        const pr = getPeriodTiming(state.periods, prId);
        if (timesOverlap(startTime, endTime, pr.start, pr.end) || candSlot.periodId === prId) {
          pushConflict(
            'venue_conflict',
            {
              typeLabel: 'تعارض القاعة (مستخدمة كمصلى رسمي)',
              existingProgramId: `PRAYER-${prId}-${unit.venueId}`,
              existingEntityKind: 'supervision_venue',
              existingProgram: `إقامة ${pr.name} وإشراف المصلى`,
              existingDepartment: 'وحدة الإشراف اليومي',
              employeeName: 'مشرفو المصلى',
              scopeName: 'جميع طلاب الدور',
              venueId: unit.venueId,
              venueName: vName,
              reason: `الموقع (${vName}) مخصص كمصلى رسمي للطلاب خلال وقت ${pr.name} (${pr.start} - ${pr.end}).`,
              source: 'جدول الإشراف اليومي',
              defaultSeverity: 'تعارض حرج',
            },
            pObj?.conflictBehavior || null
          );
        }
      });
    }
  }

  // 3. Weekly Recurring Timetable Commitments (Teachers, Venues, Scopes, and Specific Students' Scopes) across all covered days in range
  (state.weeklyCommitments || []).forEach((rawWcm) => {
    const matchedDateObj = activeDatesList.find((dObj) => {
      const wcmCheck = getEffectiveWeeklyCommitment(rawWcm, dObj.date, state.commitmentOverrides);
      return wcmCheck && wcmCheck.day === dObj.day;
    });
    if (!matchedDateObj) return;
    const wcm = getEffectiveWeeklyCommitment(rawWcm, matchedDateObj.date, state.commitmentOverrides);
    if (!wcm) return;
    if (!slotsOverlap(candSlot, { periodId: wcm.periodId }, state.periods)) return;
    const conflictDayLabel =
      endDateStr && endDateStr > dateStr ? `${wcm.day} (ضمن النطاق ${dateRangeDisplay})` : wcm.day;

    const wcmEmps = [wcm.leadEmployeeId, ...(wcm.participatingEmployeeIds || [])].filter(Boolean);
    const wcmScopes = wcm.scopeIds || [];
    const wcmDeptName = deptMap[wcm.departmentId] || 'الجدول العام';
    const wcmSource = (wcm.sourceFiles || []).join(' + ');

    allEmpIds.forEach((empId) => {
      if (wcmEmps.includes(empId)) {
        pushConflict('teacher_conflict', {
          typeLabel: 'تعارض المعلم / جدول الحصص والأنشطة',
          existingProgramId: wcm.id,
          existingEntityKind: 'weekly_commitment',
          existingProgram: wcm.title,
          existingDepartment: wcmDeptName,
          employeeId: empId,
          employeeName: empMap[empId] || empId,
          scopeName: wcmScopes.map((s) => scopeMap[s]).filter(Boolean).join('، ') || '—',
          venueName: venueMap[wcm.venueId] || wcm.venueNote || '—',
          day: conflictDayLabel,
          date: matchedDateObj.date || dateStr,
          reason: `الموظف (${empMap[empId]}) لديه التزام مجدول (${wcm.title}) يوم ${conflictDayLabel} في ${wcm.periodName}.`,
          source: wcmSource,
          defaultSeverity: 'تعارض يحتاج استثناء',
        });
      }
    });

    if (unit.venueId && wcm.venueId && unit.venueId === wcm.venueId) {
      pushConflict('venue_conflict', {
        typeLabel: 'تعارض إشغال القاعة / الموقع',
        existingProgramId: wcm.id,
        existingEntityKind: 'weekly_commitment',
        existingProgram: wcm.title,
        existingDepartment: wcmDeptName,
        employeeName: wcmEmps.map((id) => empMap[id]).filter(Boolean).join('، ') || '—',
        scopeName: wcmScopes.map((s) => scopeMap[s]).filter(Boolean).join('، ') || '—',
        venueId: wcm.venueId,
        venueName: venueMap[wcm.venueId],
        day: conflictDayLabel,
        date: matchedDateObj.date || dateStr,
        reason: `الموقع (${venueMap[wcm.venueId]}) مشغول ببرنامج/حصة (${wcm.title}) يوم ${conflictDayLabel} خلال ${wcm.periodName}.`,
        source: wcmSource,
        defaultSeverity: 'تعارض يحتاج تعديل',
      });
    }

    const overlappingScopes = wcmScopes.filter((sid) => candScopeIds.has(sid));
    if (overlappingScopes.length > 0) {
      const scNames = overlappingScopes.map((sid) => scopeMap[sid]).join('، ');
      pushConflict('scope_conflict', {
        typeLabel: 'تعارض الفئة / النطاق المستهدف',
        existingProgramId: wcm.id,
        existingEntityKind: 'weekly_commitment',
        existingProgram: wcm.title,
        existingDepartment: wcmDeptName,
        employeeName: wcmEmps.map((id) => empMap[id]).filter(Boolean).join('، ') || '—',
        scopeIds: overlappingScopes,
        scopeName: scNames,
        venueName: venueMap[wcm.venueId] || wcm.venueNote || '—',
        day: conflictDayLabel,
        date: matchedDateObj.date || dateStr,
        reason: `الفئة المستهدفة (${scNames}) مرتبطة بالتزام قائم (${wcm.title}) تبع ${wcmDeptName} يوم ${conflictDayLabel} في ${wcm.periodName}.`,
        source: wcmSource,
        defaultSeverity: 'تعارض حرج',
      });
    }

    // Student vs Weekly Commitment of student's own Scope (Req 30)
    candStudentIds.forEach((stuId) => {
      const stu = studentMap[stuId];
      if (stu?.scopeId && wcmScopes.includes(stu.scopeId)) {
        pushConflict('student_conflict', {
          typeLabel: 'تعارض الطالب مع جدول فئته الدراسي',
          existingProgramId: wcm.id,
          existingEntityKind: 'weekly_commitment',
          existingProgram: wcm.title,
          existingDepartment: wcmDeptName,
          studentId: stu.id,
          studentName: stu.name,
          scopeName: scopeMap[stu.scopeId] || '—',
          venueName: venueMap[wcm.venueId] || '—',
          day: conflictDayLabel,
          date: matchedDateObj.date || dateStr,
          reason: `الطالب (${stu.name}) مرتبط في نفس الوقت بحصة/نشاط فئته (${wcm.title}) يوم ${conflictDayLabel} خلال ${wcm.periodName}.`,
          source: wcmSource,
          defaultSeverity: 'تعارض حرج',
        });
      }
    });
  });

  // 4. Other Scheduled Department Programs (and their Sub-Programs!) + Student Conflicts (Req 23, 24, 30)
  (state.scheduledExecutions || []).forEach((exec) => {
    if (mainCandidate.id && exec.id === mainCandidate.id) return;
    if (!ACTIVE_EXEC_STATUSES.has(exec.status)) return;

    const execUnits = [
      {
        id: exec.id,
        label: exec.programName,
        executionDate: exec.executionDate,
        executionEndDate: exec.executionEndDate || exec.executionDate,
        day: exec.day,
        periodId: exec.periodId,
        fromPeriodId: exec.fromPeriodId || exec.periodId,
        toPeriodId: exec.toPeriodId || exec.periodId,
        coveredPeriodIds: exec.coveredPeriodIds,
        startTime: exec.startTime,
        endTime: exec.endTime,
        venueId: exec.venueId,
        leadEmployeeId: exec.leadEmployeeId,
        participatingEmployeeIds: exec.participatingEmployeeIds || [],
        scopeIds: exec.scopeIds || [],
        studentIds: exec.studentIds || [],
        isSub: false,
      },
      ...(exec.subPrograms || []).map((sp) => {
        const spStart = sp.executionDate || exec.executionDate;
        const spEnd = sp.executionEndDate || spStart;
        return {
          id: `${exec.id}::${sp.id}`,
          label: `${exec.programName} ↳ ${sp.name}`,
          executionDate: spStart,
          executionEndDate: spEnd,
          day: dateToArabicDay(spStart) || exec.day,
          periodId: sp.fromPeriodId || sp.periodId || exec.periodId,
          fromPeriodId: sp.fromPeriodId || sp.periodId || exec.periodId,
          toPeriodId: sp.toPeriodId || sp.fromPeriodId || exec.periodId,
          coveredPeriodIds: sp.coveredPeriodIds,
          startTime: sp.startTime,
          endTime: sp.endTime,
          venueId: sp.venueId || exec.venueId,
          leadEmployeeId: sp.leadEmployeeId || exec.leadEmployeeId,
          participatingEmployeeIds: sp.participatingEmployeeIds || [],
          scopeIds: sp.targetMode === 'students' ? [] : sp.scopeIds || [],
          studentIds: sp.targetMode === 'scopes' ? [] : sp.studentIds || [],
          isSub: true,
        };
      }),
    ];

    const execDeptName = deptMap[exec.departmentId] || exec.departmentName || 'قسم آخر';
    const isSpecial =
      exec.programType === 'برنامج نوعي' ||
      exec.programType === 'فعالية عامة' ||
      exec.status === 'معتمد باستثناء';

    execUnits.forEach((eu) => {
      const sameDate =
        dateStr && eu.executionDate
          ? dateRangesOverlap(dateStr, endDateStr || dateStr, eu.executionDate, eu.executionEndDate || eu.executionDate)
          : coveredDaysSet.has(eu.day) &&
            (!mainCandidate.globalWeek || !exec.executionGlobalWeek || mainCandidate.globalWeek === exec.executionGlobalWeek);
      if (!sameDate) return;
      if (!slotsOverlap(candSlot, eu, state.periods)) return;

      const execEmps = [eu.leadEmployeeId, ...(eu.participatingEmployeeIds || [])].filter(Boolean);
      const execScopes = eu.scopeIds || [];
      const execStudents = new Set(eu.studentIds || []);

      if (!eu.isSub && isSpecial) {
        const sharedScopes = execScopes.filter((sid) => candScopeIds.has(sid));
        const sharedEmps = execEmps.filter((eid) => allEmpIds.includes(eid));
        const sameVenue = unit.venueId && eu.venueId && unit.venueId === eu.venueId;
        if (sharedScopes.length > 0 || sharedEmps.length > 0 || sameVenue || exec.targetsAllScopes) {
          pushConflict('special_program_conflict', {
            typeLabel: 'تعارض مع برنامج نوعي / استثناء معتمد',
            existingProgramId: exec.id,
            existingEntityKind: 'scheduled_execution',
            existingProgram: eu.label,
            existingDepartment: execDeptName,
            employeeName: execEmps.map((id) => empMap[id]).filter(Boolean).join('، ') || '—',
            scopeName: execScopes.map((s) => scopeMap[s]).filter(Boolean).join('، ') || 'عام',
            venueName: venueMap[eu.venueId] || '—',
            reason: `يوجد ${exec.programType} (${eu.label} — ${exec.status}) معتمد في نفس الوقت ويؤثر على الفئات أو الموارد المشتركة.`,
            source: 'الجدول التشغيلي الموحد',
            defaultSeverity: 'تعارض حرج',
          });
        }
      }

      allEmpIds.forEach((empId) => {
        if (execEmps.includes(empId)) {
          pushConflict('employee_conflict', {
            typeLabel: 'تعارض الموظف في برنامج تنفيذي آخر',
            existingProgramId: exec.id,
            existingEntityKind: 'scheduled_execution',
            existingProgram: eu.label,
            existingDepartment: execDeptName,
            employeeId: empId,
            employeeName: empMap[empId] || empId,
            scopeName: execScopes.map((s) => scopeMap[s]).filter(Boolean).join('، ') || '—',
            venueName: venueMap[eu.venueId] || '—',
            reason: `الموظف (${empMap[empId]}) مسجل في برنامج آخر (${eu.label}) تابع لـ ${execDeptName}.`,
            source: 'الجدول التشغيلي الموحد',
            defaultSeverity: 'تعارض يحتاج استثناء',
          });
        }
      });

      if (unit.venueId && eu.venueId && unit.venueId === eu.venueId) {
        pushConflict('venue_conflict', {
          typeLabel: 'تعارض إشغال القاعة مع برنامج مجدول',
          existingProgramId: exec.id,
          existingEntityKind: 'scheduled_execution',
          existingProgram: eu.label,
          existingDepartment: execDeptName,
          employeeName: execEmps.map((id) => empMap[id]).filter(Boolean).join('، ') || '—',
          scopeName: execScopes.map((s) => scopeMap[s]).filter(Boolean).join('، ') || '—',
          venueId: eu.venueId,
          venueName: venueMap[eu.venueId] || '—',
          reason: `القاعة (${venueMap[eu.venueId]}) محجوزة لـ (${eu.label}) تابع لـ ${execDeptName}.`,
          source: 'الجدول التشغيلي الموحد',
          defaultSeverity: 'تعارض يحتاج تعديل',
        });
      }

      const sharedExecScopes = execScopes.filter((sid) => candScopeIds.has(sid));
      if (sharedExecScopes.length > 0) {
        const scNames = sharedExecScopes.map((s) => scopeMap[s]).join('، ');
        pushConflict('scope_conflict', {
          typeLabel: 'تعارض الفئة مع برنامج قسم آخر',
          existingProgramId: exec.id,
          existingEntityKind: 'scheduled_execution',
          existingProgram: eu.label,
          existingDepartment: execDeptName,
          employeeName: execEmps.map((id) => empMap[id]).filter(Boolean).join('، ') || '—',
          scopeIds: sharedExecScopes,
          scopeName: scNames,
          venueName: venueMap[eu.venueId] || '—',
          reason: `الفئة (${scNames}) مجدولة بالفعل في (${eu.label}) تابع لـ ${execDeptName}.`,
          source: 'الجدول التشغيلي الموحد',
          defaultSeverity: 'تعارض حرج',
        });
      } else if (!eu.isSub && exec.departmentId !== mainCandidate.departmentId) {
        pushConflict('cross_dept_conflict', {
          typeLabel: 'تنبيه تزامن برامج الأقسام',
          existingProgramId: exec.id,
          existingEntityKind: 'scheduled_execution',
          existingProgram: eu.label,
          existingDepartment: execDeptName,
          employeeName: execEmps.map((id) => empMap[id]).filter(Boolean).join('، ') || '—',
          scopeName: execScopes.map((s) => scopeMap[s]).filter(Boolean).join('، ') || '—',
          venueName: venueMap[eu.venueId] || '—',
          reason: `يوجد برنامج متزامن لقسم آخر (${execDeptName}: ${eu.label}) في نفس الفترة؛ يوصى بالتنسيق العام للمرافق.`,
          source: 'مركز التنسيق بين الأقسام',
          defaultSeverity: 'تنبيه فقط',
          requiresException: false,
        });
      }

      // Specific Student Conflict Detection (Req #30: الطالب، البرنامج الحالي، البرنامج الجديد، الوقت، الفترة)
      candStudentIds.forEach((stuId) => {
        const stu = studentMap[stuId];
        const inOtherStudents = execStudents.has(stuId);
        const inOtherScope = stu?.scopeId && execScopes.includes(stu.scopeId);
        if (inOtherStudents || inOtherScope) {
          pushConflict('student_conflict', {
            typeLabel: 'تعارض الطالب في برنامج متزامن',
            existingProgramId: exec.id,
            existingEntityKind: 'scheduled_execution',
            existingProgram: eu.label,
            existingDepartment: execDeptName,
            studentId: stuId,
            studentName: stu?.name || stuId,
            scopeName: stu?.scopeId ? scopeMap[stu.scopeId] || '—' : 'طلاب محددون',
            venueName: venueMap[eu.venueId] || '—',
            reason: `الطالب (${stu?.name || stuId}) مسجل في نفس الوقت داخل البرنامج الحالي (${eu.label}) بينما يُطلب ضمه إلى (${unit.subProgramName ? `${mainCandidate.programName} ↳ ${unit.subProgramName}` : mainCandidate.programName}) في ${rangeInfo.combinedLabel} (${startTime} - ${endTime}).`,
            source: 'قاعدة بيانات الطلاب والجدول التشغيلي',
            defaultSeverity: 'تعارض حرج',
          });
        }
      });
    });
  });

  return unitConflicts;
}

/**
 * Full Two-Level Multi-Source Conflict Engine (Main Program + Hierarchical Sub-Programs + Students + 4-Level Behavior)
 */
export function detectProgramConflicts(candidate, state) {
  const allRawConflicts = [];

  // 1. Inspect Main Program
  const mainUnit = {
    ...candidate,
    subProgramId: null,
    subProgramName: null,
  };
  allRawConflicts.push(...inspectSingleUnit(mainUnit, candidate, state));

  // 2. Inspect Each Sub-Program Independently (Req #18, #23, #24)
  const subPrograms = Array.isArray(candidate.subPrograms) ? candidate.subPrograms : [];
  subPrograms.forEach((sp) => {
    const spStartDate = sp.executionDate || candidate.executionDate;
    const spEndDate = sp.executionEndDate || spStartDate;
    const subUnit = {
      subProgramId: sp.id,
      subProgramName: sp.name || 'فقرة فرعية',
      executionDate: spStartDate,
      executionEndDate: spEndDate,
      day: dateToArabicDay(spStartDate) || candidate.day,
      periodId: sp.fromPeriodId || sp.periodId || candidate.fromPeriodId || candidate.periodId,
      fromPeriodId: sp.fromPeriodId || sp.periodId || candidate.fromPeriodId || candidate.periodId,
      toPeriodId: sp.toPeriodId || sp.fromPeriodId || sp.periodId || candidate.fromPeriodId || candidate.periodId,
      startTime: sp.startTime,
      endTime: sp.endTime,
      venueId: sp.venueId || candidate.venueId,
      leadEmployeeId: sp.leadEmployeeId || candidate.leadEmployeeId,
      participatingEmployeeIds: sp.participatingEmployeeIds || [],
      targetMode: sp.targetMode || 'scopes',
      scopeIds: sp.scopeIds || [],
      studentIds: sp.studentIds || [],
    };
    allRawConflicts.push(...inspectSingleUnit(subUnit, candidate, state));
  });

  // 3. Internal Sub-Program vs Sub-Program Overlap Check within the same Main Program
  const empMap = Object.fromEntries((state.employees || []).map((e) => [e.id, e.name]));
  const venueMap = Object.fromEntries((state.venues || []).map((v) => [v.id, v.name]));
  const studentMap = Object.fromEntries((state.students || []).map((st) => [st.id, st]));

  for (let i = 0; i < subPrograms.length; i++) {
    for (let j = i + 1; j < subPrograms.length; j++) {
      const a = subPrograms[i];
      const b = subPrograms[j];
      const dateA = a.executionDate || candidate.executionDate;
      const endDateA = a.executionEndDate || dateA;
      const dateB = b.executionDate || candidate.executionDate;
      const endDateB = b.executionEndDate || dateB;
      if (!dateRangesOverlap(dateA, endDateA, dateB, endDateB)) continue;

      const rA = computeCoveredPeriods(state.periods, a.fromPeriodId || 'P1', a.toPeriodId || a.fromPeriodId || 'P1');
      const rB = computeCoveredPeriods(state.periods, b.fromPeriodId || 'P1', b.toPeriodId || b.fromPeriodId || 'P1');
      const sA = a.startTime || rA.startTime;
      const eA = a.endTime || rA.endTime;
      const sB = b.startTime || rB.startTime;
      const eB = b.endTime || rB.endTime;

      if (!timesOverlap(sA, eA, sB, eB)) continue;

      if (a.leadEmployeeId && a.leadEmployeeId === b.leadEmployeeId) {
        allRawConflicts.push({
          id: `CNF-INT-EMP-${i}-${j}`,
          code: 'employee_conflict',
          conflictBehavior: 'actual_conflict',
          severity: 'تعارض يحتاج تعديل',
          requiresException: true,
          mainProgramName: candidate.programName || 'البرنامج الرئيسي',
          subProgramId: b.id,
          subProgramName: b.name,
          proposedProgram: `${candidate.programName || 'البرنامج'} ↳ ${b.name}`,
          existingProgram: `فقرة شقيقة: ${a.name}`,
          existingDepartment: 'نفس البرنامج الرئيسي',
          employeeId: a.leadEmployeeId,
          employeeName: empMap[a.leadEmployeeId] || a.leadEmployeeId,
          venueName: venueMap[b.venueId] || '—',
          day: dateToArabicDay(dateB),
          date: dateB,
          periodName: rB.combinedLabel,
          timeRange: `${sB} - ${eB}`,
          typeLabel: 'تعارض داخلي بين فقرتين فرعيتين (نفس المسؤول)',
          reason: `المسؤول (${empMap[a.leadEmployeeId]}) مكلف بفقرتين متداخلتين زمنيًا داخل نفس البرنامج: «${a.name}» و«${b.name}».`,
          source: 'الفحص الهرمي للفقرات الفرعية',
        });
      }

      const sharedStu = (a.studentIds || []).filter((id) => (b.studentIds || []).includes(id));
      sharedStu.forEach((stuId) => {
        const stu = studentMap[stuId];
        allRawConflicts.push({
          id: `CNF-INT-STU-${i}-${j}-${stuId}`,
          code: 'student_conflict',
          conflictBehavior: 'actual_conflict',
          severity: 'تعارض حرج',
          requiresException: true,
          mainProgramName: candidate.programName || 'البرنامج الرئيسي',
          subProgramId: b.id,
          subProgramName: b.name,
          proposedProgram: `${candidate.programName || 'البرنامج'} ↳ ${b.name}`,
          existingProgram: `فقرة شقيقة: ${a.name}`,
          existingDepartment: 'نفس البرنامج الرئيسي',
          studentId: stuId,
          studentName: stu?.name || stuId,
          day: dateToArabicDay(dateB),
          date: dateB,
          periodName: rB.combinedLabel,
          timeRange: `${sB} - ${eB}`,
          typeLabel: 'تعارض طالب بين فقرتين فرعيتين متزامنتين',
          reason: `الطالب (${stu?.name || stuId}) مضاف في فقرتين فرعيتين متزامنتين («${a.name}» و«${b.name}»).`,
          source: 'الفحص الهرمي للفقرات الفرعية',
        });
      });
    }
  }

  const severityRank = {
    'لا يوجد تعارض': 0,
    'تنبيه فقط': 1,
    'تنبيه مهم': 2,
    'تعارض يحتاج تعديل': 3,
    'تعارض يحتاج استثناء': 4,
    'تعارض فعلي': 4,
    'تعارض حرج': 5,
  };

  // Deduplicate identical conflict signatures (preferring the more specific subProgram entry when identical)
  const deduped = [];
  const seenKeys = new Set();
  // Put sub-program conflicts first so if main+sub share exact same resource conflict, the pinpoint sub-program entry is kept or both distinct slots kept
  const ordered = [
    ...allRawConflicts.filter((c) => Boolean(c.subProgramId)),
    ...allRawConflicts.filter((c) => !c.subProgramId),
  ];
  ordered.forEach((c, idx) => {
    const sig = `${c.code}|${c.existingProgramId || c.existingProgram}|${c.employeeId || ''}|${c.studentId || ''}|${c.venueId || ''}|${c.subProgramId || 'MAIN'}`;
    const baseSig = `${c.code}|${c.existingProgramId || c.existingProgram}|${c.employeeId || ''}|${c.studentId || ''}|${c.venueId || ''}`;
    if (seenKeys.has(sig)) return;
    if (!c.subProgramId && seenKeys.has(`${baseSig}|HAS_SUB`)) return;
    seenKeys.add(sig);
    if (c.subProgramId) seenKeys.add(`${baseSig}|HAS_SUB`);
    deduped.push({
      ...c,
      id: `CNF-${idx + 1}-${c.code}`,
      isSubProgramConflict: Boolean(c.subProgramId),
      blocksApproval:
        c.conflictBehavior === 'actual_conflict' && (c.requiresException || (severityRank[c.severity] ?? 3) >= 3),
    });
  });

  let maxRank = 0;
  let overallLevel = 'لا يوجد تعارض';
  deduped.forEach((c) => {
    const r = severityRank[c.severity] ?? 3;
    if (r > maxRank) {
      maxRank = r;
      overallLevel = c.severity;
    }
  });

  const blockingConflicts = deduped.filter(
    (c) => c.conflictBehavior === 'actual_conflict' && (c.requiresException || (severityRank[c.severity] ?? 3) >= 3)
  );
  const blockingIds = new Set(blockingConflicts.map((c) => c.id));
  const advisoryConflicts = deduped.filter((c) => !blockingIds.has(c.id));

  return {
    conflicts: deduped,
    blockingConflicts,
    advisoryConflicts,
    overallLevel,
    canApproveDirectly: blockingConflicts.length === 0,
    requiresException: blockingConflicts.length > 0,
  };
}

/**
 * Split all venues into Available vs Occupied for a chosen Day + Period/Range/Time
 */
export function getVenuesAvailability(
  { day, executionDate, executionEndDate, periodId, fromPeriodId, toPeriodId, coveredPeriodIds, startTime, endTime, excludeExecId },
  state
) {
  const effectiveDay = day || dateToArabicDay(executionDate);
  const effEndDate = executionEndDate || executionDate;
  const coveredDatesList = executionDate
    ? expandDatesRange(executionDate, effEndDate, { workDaysOnly: true })
    : [{ date: '', day: effectiveDay }];
  const activeDatesList =
    coveredDatesList.length > 0 ? coveredDatesList : [{ date: executionDate || '', day: effectiveDay || 'الأحد' }];
  const coveredDaysSet = new Set(activeDatesList.map((d) => d.day).filter(Boolean));
  const range = computeCoveredPeriods(
    state.periods,
    fromPeriodId || periodId || 'P1',
    toPeriodId || fromPeriodId || periodId || 'P1'
  );
  const sTime = startTime || range.startTime;
  const eTime = endTime || range.endTime;
  const candSlot = {
    periodId: range.fromPeriodId,
    fromPeriodId: range.fromPeriodId,
    toPeriodId: range.toPeriodId,
    coveredPeriodIds: coveredPeriodIds || range.coveredPeriodIds,
    startTime: sTime,
    endTime: eTime,
  };

  const deptMap = Object.fromEntries((state.departments || []).map((d) => [d.id, d.name]));
  const empMap = Object.fromEntries((state.employees || []).map((e) => [e.id, e.name]));
  const scopeMap = Object.fromEntries((state.scopes || []).map((s) => [s.id, s.name]));
  const periodObjMap = Object.fromEntries((state.periods || []).map((p) => [p.id, p]));

  const availableVenues = [];
  const occupiedVenues = [];

  (state.venues || []).forEach((venue) => {
    if (venue.status === 'خارج الخدمة' || venue.status === 'صيانة') {
      occupiedVenues.push({
        venue,
        occupancies: [
          {
            programName: 'مغلق للصيانة / غير متاح حاليًا',
            departmentName: 'إدارة المرافق',
            scopeName: '—',
            employeeName: '—',
            timeRange: `${sTime} - ${eTime}`,
            source: 'إدارة القاعات والمواقع',
          },
        ],
      });
      return;
    }

    if (!effectiveDay) {
      availableVenues.push(venue);
      return;
    }

    const occupancies = [];

    const isPrayerHall = venue.name.includes('فوزية') || venue.name.includes('الصالة الرياضية');
    if (isPrayerHall) {
      ['PER_ASR', 'PER_MAGHRIB', 'PER_ISHA'].forEach((prId) => {
        const pObj = periodObjMap[prId];
        if (pObj && (pObj.enterConflictEngine === false || pObj.conflictBehavior === 'ignore')) return;
        const pr = getPeriodTiming(state.periods, prId);
        if (timesOverlap(sTime, eTime, pr.start, pr.end) || candSlot.periodId === prId) {
          occupancies.push({
            programName: `مصلى الطلاب (${pr.name})`,
            departmentName: 'الإشراف اليومي',
            scopeName: 'جميع الطلاب',
            employeeName: 'مشرفو المصلى',
            timeRange: `${pr.start} - ${pr.end}`,
            source: 'جدول الإشراف اليومي',
          });
        }
      });
    }

    (state.weeklyCommitments || []).forEach((rawWcm) => {
      const matchedDayObj = activeDatesList.find((dObj) => {
        const wcmCheck = getEffectiveWeeklyCommitment(rawWcm, dObj.date, state.commitmentOverrides);
        return wcmCheck && wcmCheck.day === dObj.day && wcmCheck.venueId === venue.id;
      });
      if (!matchedDayObj) return;
      const wcm = getEffectiveWeeklyCommitment(rawWcm, matchedDayObj.date, state.commitmentOverrides);
      if (!wcm || wcm.venueId !== venue.id) return;
      if (slotsOverlap(candSlot, { periodId: wcm.periodId }, state.periods)) {
        const pT = getPeriodTiming(state.periods, wcm.periodId);
        occupancies.push({
          programName: wcm.title,
          departmentName: deptMap[wcm.departmentId] || 'الجدول العام',
          scopeName: (wcm.scopeIds || []).map((id) => scopeMap[id]).filter(Boolean).join('، ') || 'عام',
          employeeName: empMap[wcm.leadEmployeeId] || '—',
          timeRange: `${wcm.day} • ${pT.start} - ${pT.end} (${pT.name})`,
          source: (wcm.sourceFiles || [])[0] || 'جدول القاعات / المعلمين',
        });
      }
    });

    (state.scheduledExecutions || []).forEach((exec) => {
      if (excludeExecId && exec.id === excludeExecId) return;
      if (!ACTIVE_EXEC_STATUSES.has(exec.status)) return;
      const sameDate =
        executionDate && exec.executionDate
          ? dateRangesOverlap(executionDate, effEndDate, exec.executionDate, exec.executionEndDate || exec.executionDate)
          : coveredDaysSet.has(exec.day);
      if (!sameDate) return;

      if (
        exec.venueId === venue.id &&
        slotsOverlap(
          candSlot,
          {
            periodId: exec.periodId,
            fromPeriodId: exec.fromPeriodId,
            toPeriodId: exec.toPeriodId,
            coveredPeriodIds: exec.coveredPeriodIds,
            startTime: exec.startTime,
            endTime: exec.endTime,
          },
          state.periods
        )
      ) {
        occupancies.push({
          programName: exec.programName,
          departmentName: deptMap[exec.departmentId] || exec.departmentName || '—',
          scopeName: (exec.scopeIds || []).map((id) => scopeMap[id]).filter(Boolean).join('، ') || 'عام',
          employeeName: empMap[exec.leadEmployeeId] || '—',
          timeRange: `${exec.startTime} - ${exec.endTime}`,
          source: 'الجدول التشغيلي الموحد',
        });
      }

      (exec.subPrograms || []).forEach((sp) => {
        if (sp.venueId !== venue.id) return;
        const spStart = sp.executionDate || exec.executionDate;
        const spEnd = sp.executionEndDate || spStart;
        const spDateMatch =
          executionDate && spStart ? dateRangesOverlap(executionDate, effEndDate, spStart, spEnd) : true;
        if (!spDateMatch) return;
        if (
          slotsOverlap(
            candSlot,
            {
              periodId: sp.fromPeriodId || sp.periodId,
              fromPeriodId: sp.fromPeriodId,
              toPeriodId: sp.toPeriodId,
              coveredPeriodIds: sp.coveredPeriodIds,
              startTime: sp.startTime,
              endTime: sp.endTime,
            },
            state.periods
          )
        ) {
          occupancies.push({
            programName: `${exec.programName} ↳ ${sp.name}`,
            departmentName: deptMap[exec.departmentId] || exec.departmentName || '—',
            scopeName: 'فقرة فرعية',
            employeeName: empMap[sp.leadEmployeeId || exec.leadEmployeeId] || '—',
            timeRange: `${sp.startTime || ''} - ${sp.endTime || ''}`,
            source: 'الجدول التشغيلي (فقرات فرعية)',
          });
        }
      });
    });

    if (occupancies.length > 0) {
      occupiedVenues.push({ venue, occupancies });
    } else {
      availableVenues.push(venue);
    }
  });

  const typePriority = {
    'قاعة متخصصة': 1,
    'قاعة كبرى / مصلى': 2,
    'مرفق رياضي / مصلى': 3,
    'ساحة وموقع عام': 4,
    'مرفق خدمي وتشغيلي': 5,
    'قاعة دراسية': 6,
  };
  availableVenues.sort((a, b) => (typePriority[a.type] || 9) - (typePriority[b.type] || 9));

  return { availableVenues, occupiedVenues };
}

/**
 * Automatic Smart Alternatives Generator (Req #34)
 */
export function generateConflictAlternatives(candidate, state, currentConflicts = []) {
  const alternatives = [];
  const conflictCodes = new Set(currentConflicts.map((c) => c.code));
  const venueMap = Object.fromEntries((state.venues || []).map((v) => [v.id, v.name]));
  const empMap = Object.fromEntries((state.employees || []).map((e) => [e.id, e.name]));
  const periodIds = ['P1', 'P2', 'P3'];
  const weekDates = getDatesForGlobalWeek(candidate.globalWeek || state.meta.currentGlobalWeek);

  if (conflictCodes.has('venue_conflict')) {
    const { availableVenues } = getVenuesAvailability(
      {
        day: candidate.day,
        executionDate: candidate.executionDate,
        periodId: candidate.periodId,
        fromPeriodId: candidate.fromPeriodId,
        toPeriodId: candidate.toPeriodId,
        startTime: candidate.startTime,
        endTime: candidate.endTime,
        excludeExecId: candidate.id,
      },
      state
    );
    for (const v of availableVenues.slice(0, 4)) {
      const testCand = { ...candidate, venueId: v.id };
      const res = detectProgramConflicts(testCand, state);
      if (res.canApproveDirectly) {
        alternatives.push({
          id: `ALT-VEN-${v.id}`,
          category: 'تغيير القاعة (نفس الموعد)',
          label: `نقل التنفيذ إلى قاعة متاحة: «${v.name}» (${v.type}) في نفس اليوم والفترة`,
          changes: { venueId: v.id },
          summaryBadges: [candidate.day, getPeriodTiming(state.periods, candidate.periodId).name, v.name],
        });
        if (alternatives.length >= 2) break;
      }
    }
  }

  for (const pid of periodIds) {
    if (pid === candidate.periodId && (!candidate.toPeriodId || candidate.toPeriodId === pid)) continue;
    const pT = getPeriodTiming(state.periods, pid);
    let testVenueId = candidate.venueId;
    const { availableVenues } = getVenuesAvailability(
      { day: candidate.day, executionDate: candidate.executionDate, periodId: pid, excludeExecId: candidate.id },
      state
    );
    if (!testVenueId || !availableVenues.some((v) => v.id === testVenueId)) {
      testVenueId = availableVenues[0]?.id || testVenueId;
    }
    const testCand = {
      ...candidate,
      periodId: pid,
      fromPeriodId: pid,
      toPeriodId: pid,
      coveredPeriodIds: [pid],
      startTime: pT.start,
      endTime: pT.end,
      venueId: testVenueId,
    };
    const res = detectProgramConflicts(testCand, state);
    if (res.canApproveDirectly) {
      alternatives.push({
        id: `ALT-PER-${pid}`,
        category: 'تغيير الفترة (نفس اليوم)',
        label: `التنفيذ يوم ${candidate.day} في «${pT.name}» (${pT.start} - ${pT.end}) — القاعة: ${venueMap[testVenueId] || 'متاحة'}`,
        changes: {
          periodId: pid,
          fromPeriodId: pid,
          toPeriodId: pid,
          coveredPeriodIds: [pid],
          startTime: pT.start,
          endTime: pT.end,
          venueId: testVenueId,
        },
        summaryBadges: [candidate.day, pT.name, venueMap[testVenueId] || 'متاحة'],
      });
    }
  }

  for (const dName of WORK_DAYS_AR) {
    if (dName === candidate.day) continue;
    const dIso = weekDates[dName] || candidate.executionDate;
    for (const pid of periodIds) {
      const pT = getPeriodTiming(state.periods, pid);
      const { availableVenues } = getVenuesAvailability(
        { day: dName, executionDate: dIso, periodId: pid, excludeExecId: candidate.id },
        state
      );
      let testVenueId = candidate.venueId;
      if (!testVenueId || !availableVenues.some((v) => v.id === testVenueId)) {
        testVenueId = availableVenues[0]?.id || testVenueId;
      }
      const testCand = {
        ...candidate,
        day: dName,
        executionDate: dIso,
        periodId: pid,
        fromPeriodId: pid,
        toPeriodId: pid,
        coveredPeriodIds: [pid],
        startTime: pT.start,
        endTime: pT.end,
        venueId: testVenueId,
      };
      const res = detectProgramConflicts(testCand, state);
      if (res.canApproveDirectly) {
        alternatives.push({
          id: `ALT-DAY-${dName}-${pid}`,
          category: 'يوم وفترة بديلة بنفس الأسبوع',
          label: `نقل الموعد إلى يوم ${dName} (${dIso}) — ${pT.name} (${pT.start} - ${pT.end}) — الموقع: ${venueMap[testVenueId] || 'متاح'}`,
          changes: {
            day: dName,
            executionDate: dIso,
            periodId: pid,
            fromPeriodId: pid,
            toPeriodId: pid,
            coveredPeriodIds: [pid],
            startTime: pT.start,
            endTime: pT.end,
            venueId: testVenueId,
          },
          summaryBadges: [`${dName} (${dIso})`, pT.name, venueMap[testVenueId] || 'متاح'],
        });
        break;
      }
    }
    if (alternatives.length >= 6) break;
  }

  if (
    conflictCodes.has('teacher_conflict') ||
    conflictCodes.has('employee_conflict') ||
    conflictCodes.has('supervision_conflict')
  ) {
    const deptEmployees = (state.employees || []).filter(
      (e) => e.departmentId === candidate.departmentId && e.id !== candidate.leadEmployeeId && e.accountStatus !== 'غير نشط'
    );
    const pool =
      deptEmployees.length > 0
        ? deptEmployees
        : (state.employees || []).filter((e) => e.id !== candidate.leadEmployeeId && e.id !== 'EMP-00');
    for (const emp of pool) {
      const { availableVenues } = getVenuesAvailability(
        {
          day: candidate.day,
          executionDate: candidate.executionDate,
          periodId: candidate.periodId,
          fromPeriodId: candidate.fromPeriodId,
          toPeriodId: candidate.toPeriodId,
          startTime: candidate.startTime,
          endTime: candidate.endTime,
          excludeExecId: candidate.id,
        },
        state
      );
      const vId =
        candidate.venueId && availableVenues.some((v) => v.id === candidate.venueId)
          ? candidate.venueId
          : availableVenues[0]?.id || candidate.venueId;

      const testCand = {
        ...candidate,
        leadEmployeeId: emp.id,
        participatingEmployeeIds: (candidate.participatingEmployeeIds || []).filter((x) => x !== emp.id),
        venueId: vId,
      };
      const res = detectProgramConflicts(testCand, state);
      if (res.canApproveDirectly) {
        alternatives.push({
          id: `ALT-EMP-${emp.id}`,
          category: 'موظف متاح بديل',
          label: `إسناد التنفيذ للموظف المتاح «${empMap[emp.id]}» (${emp.jobTitle})${vId !== candidate.venueId ? ` في قاعة «${venueMap[vId]}»` : ''}`,
          changes: {
            leadEmployeeId: emp.id,
            venueId: vId,
          },
          summaryBadges: [empMap[emp.id], candidate.day, getPeriodTiming(state.periods, candidate.periodId).name],
        });
        break;
      }
    }
  }

  return alternatives.slice(0, 6);
}

/**
 * Complete Chronological Daily Schedule for an Employee (Req #5, #6, #18, #19, #25)
 * Respects showInSchedule on fixed periods & supervision, and includes multi-period + sub-program assignments!
 */
export function getEmployeeDailyChronologicalSchedule(employeeId, dayName, dateStr, state) {
  const items = [];
  const deptMap = Object.fromEntries((state.departments || []).map((d) => [d.id, d.name]));
  const venueMap = Object.fromEntries((state.venues || []).map((v) => [v.id, v.name]));
  const scopeMap = Object.fromEntries((state.scopes || []).map((s) => [s.id, s.name]));
  const studentMap = Object.fromEntries((state.students || []).map((st) => [st.id, st.name]));

  // 1. Supervision duties (respecting showInSchedule)
  const supBlocks = getEmployeeSupervisionBlocks(employeeId, state, { forDisplay: true });
  supBlocks.forEach((sb) => {
    items.push({
      id: sb.id,
      kind: 'إشراف',
      subType: sb.type,
      title: sb.title,
      departmentName: 'الإشراف اليومي',
      location: sb.location,
      scopeName: sb.prayerRow ? `الصف (${sb.prayerRow}) في المصلى` : sb.buses ? `حافلات: ${sb.buses}` : 'طلاب الدور',
      startTime: sb.startTime,
      endTime: sb.endTime,
      periodId: sb.periodId,
      coveredPeriodIds: [sb.periodId],
      periodName: sb.type,
      status: 'تكليف ثابت',
      notes: sb.notes,
      source: sb.source,
    });
  });

  // 2. Weekly Timetable Classes & Activities (جدولي الدراسي)
  (state.weeklyCommitments || []).forEach((rawWcm) => {
    const wcm = getEffectiveWeeklyCommitment(rawWcm, dateStr, state.commitmentOverrides);
    if (!wcm || wcm.day !== dayName) return;
    const isInvolved =
      wcm.leadEmployeeId === employeeId || (wcm.participatingEmployeeIds || []).includes(employeeId);
    if (!isInvolved) return;
    const pT = getPeriodTiming(state.periods, wcm.periodId);
    items.push({
      id: wcm.id,
      kind: wcm.programType || 'برنامج تعليمي',
      isStudyTimetable: true,
      subType: wcm.programType,
      title: wcm.title,
      departmentName: deptMap[wcm.departmentId] || 'الجدول العام',
      location: venueMap[wcm.venueId] || wcm.venueNote || '—',
      scopeName: (wcm.scopeIds || []).map((id) => scopeMap[id]).filter(Boolean).join('، ') || 'عام',
      startTime: pT.start,
      endTime: pT.end,
      periodId: wcm.periodId,
      coveredPeriodIds: [wcm.periodId],
      periodName: pT.name,
      status: 'معتمد بالجدول',
      roleInItem: wcm.leadEmployeeId === employeeId ? 'مسؤول' : 'مشارك',
      source: (wcm.sourceFiles || [])[0] || 'جدول المعلمين',
    });
  });

  // 3. Scheduled Department Programs + Hierarchical Sub-Programs (supports single-day & multi-day ranges)
  (state.scheduledExecutions || []).forEach((exec) => {
    if (!ACTIVE_EXEC_STATUSES.has(exec.status)) return;
    const matchDay = isDateInExecutionRange(dateStr, dayName, exec);

    if (matchDay) {
      const isInMain =
        exec.leadEmployeeId === employeeId || (exec.participatingEmployeeIds || []).includes(employeeId);
      if (isInMain) {
        const range = computeCoveredPeriods(
          state.periods,
          exec.fromPeriodId || exec.periodId,
          exec.toPeriodId || exec.fromPeriodId || exec.periodId
        );
        const targetLabel =
          exec.targetMode === 'students' && exec.studentIds?.length
            ? `طلاب محددون (${exec.studentIds.map((id) => studentMap[id] || id).join('، ')})`
            : (exec.scopeIds || []).map((id) => scopeMap[id]).filter(Boolean).join('، ') || 'عام';

        items.push({
          id: exec.id,
          executionObj: exec,
          kind: exec.status === 'معتمد باستثناء' ? 'استثناء معتمد' : exec.programType || 'برنامج قسم',
          subType: exec.programType,
          title: exec.programName,
          subProgramsCount: (exec.subPrograms || []).length,
          departmentName: deptMap[exec.departmentId] || exec.departmentName || '—',
          location: venueMap[exec.venueId] || '—',
          scopeName: targetLabel,
          startTime: exec.startTime || range.startTime,
          endTime: exec.endTime || range.endTime,
          periodId: exec.periodId || range.fromPeriodId,
          coveredPeriodIds: exec.coveredPeriodIds || range.coveredPeriodIds,
          periodName: exec.periodName || range.combinedLabel,
          status: exec.status,
          roleInItem: exec.leadEmployeeId === employeeId ? 'مسؤول البرنامج' : 'مشارك',
          source: 'الجدول التشغيلي للأقسام',
        });
      }
    }

    // Check Sub-Programs where employee is responsible!
    (exec.subPrograms || []).forEach((sp) => {
      const spStart = sp.executionDate || exec.executionDate;
      const spEnd = sp.executionEndDate || spStart;
      const spDay = dateToArabicDay(spStart) || exec.day;
      const spMatch = isDateInExecutionRange(dateStr, dayName, {
        executionDate: spStart,
        executionEndDate: spEnd,
        day: spDay,
      });
      if (!spMatch) return;
      if (sp.leadEmployeeId !== employeeId && !(sp.participatingEmployeeIds || []).includes(employeeId)) return;

      const spRange = computeCoveredPeriods(
        state.periods,
        sp.fromPeriodId || sp.periodId || exec.periodId,
        sp.toPeriodId || sp.fromPeriodId || exec.periodId
      );
      items.push({
        id: `${exec.id}-SUB-${sp.id}`,
        executionObj: exec,
        isSubProgram: true,
        kind: 'فقرة فرعية',
        subType: 'برنامج فرعي',
        title: `↳ ${sp.name} (ضمن: ${exec.programName})`,
        departmentName: deptMap[exec.departmentId] || exec.departmentName || '—',
        location: venueMap[sp.venueId || exec.venueId] || '—',
        scopeName:
          sp.targetMode === 'students' && sp.studentIds?.length
            ? `طلاب محددون (${sp.studentIds.map((id) => studentMap[id] || id).join('، ')})`
            : (sp.scopeIds || exec.scopeIds || []).map((id) => scopeMap[id]).filter(Boolean).join('، ') || 'عام',
        startTime: sp.startTime || spRange.startTime,
        endTime: sp.endTime || spRange.endTime,
        periodId: spRange.fromPeriodId,
        coveredPeriodIds: spRange.coveredPeriodIds,
        periodName: spRange.combinedLabel,
        status: exec.status,
        roleInItem: 'مسؤول الفقرة الفرعية',
        source: 'الفقرات الفرعية للبرامج',
      });
    });
  });

  items.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  return items;
}
