package com.bright.app.domain

import com.bright.app.domain.model.ScenarioType
import com.bright.app.domain.model.ScoringCriteria
import com.bright.app.domain.model.TriageSystem
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ScoringCriteriaTest {

    @Test
    fun idsAreUniqueAndNoneIsATokenPrefixOfAnother() {
        val ids = ScoringCriteria.all.map { it.id }
        assertEquals(ids.size, ids.toSet().size, "duplicate IDs")
        // resolve() reads "ID followed by anything" as that ID, so a prefix relationship would
        // make the shorter ID unreachable.
        for (a in ids) for (b in ids) {
            if (a != b) assertTrue(!b.startsWith("$a-"), "$a is a prefix of $b")
        }
        assertTrue(ScoringCriteria.UNCITED !in ids)
    }

    @Test
    fun triageCriteriaCarrySystemAndLevelProtocolsCarrySource() {
        for (criterion in ScoringCriteria.all) {
            if (criterion.triageSystem != null) {
                assertTrue(criterion.level in 1..5, criterion.id)
                assertNull(criterion.source, criterion.id)
            } else {
                assertNull(criterion.level, criterion.id)
                assertTrue(!criterion.source.isNullOrBlank(), criterion.id)
            }
        }
    }

    @Test
    fun everyScenarioIsOfferedItsOwnProtocolsAndOnlyTheActiveSystem() {
        for (system in TriageSystem.entries) {
            for (scenario in ScenarioType.entries) {
                val offered = ScoringCriteria.offeredFor(system, scenario)
                assertTrue(offered.all { it.triageSystem == null || it.triageSystem == system })
                assertTrue(offered.any { it.triageSystem == system }, "$system $scenario: no triage levels")
                assertTrue(
                    offered.any { it.triageSystem == null && scenario in it.scenarios },
                    "$scenario has no scenario-specific protocol"
                )
                assertTrue(offered.none { it.triageSystem == null && it.scenarios.isNotEmpty() && scenario !in it.scenarios })
            }
        }
    }

    @Test
    fun customScenarioIsOfferedEveryProtocol() {
        val offered = ScoringCriteria.offeredFor(TriageSystem.KTAS, null)
        assertEquals(ScoringCriteria.all.count { it.triageSystem == null }, offered.count { it.triageSystem == null })
    }

    private val esiSepsis = ScoringCriteria.offeredFor(TriageSystem.ESI, ScenarioType.SEPSIS)
    private val ktasCardiac = ScoringCriteria.offeredFor(TriageSystem.KTAS, ScenarioType.CARDIAC_ARREST)

    @Test
    fun resolvesExactAndSloppilyFormattedIds() {
        assertEquals("SEPSIS-HOUR-ONE", ScoringCriteria.resolve("SEPSIS-HOUR-ONE", esiSepsis)?.id)
        assertEquals("SEPSIS-HOUR-ONE", ScoringCriteria.resolve("sepsis_hour_one", esiSepsis)?.id)
        assertEquals("ESI-2-HIGH-RISK", ScoringCriteria.resolve(" \"[esi 2 high risk]\" ", esiSepsis)?.id)
        assertEquals("ESI-2-HIGH-RISK", ScoringCriteria.resolve("ESI-2-HIGH-RISK: high-risk situation", esiSepsis)?.id)
    }

    @Test
    fun acceptsAPrefixOnlyWhenItIsUnambiguous() {
        assertEquals("KTAS-1-RESUSCITATION", ScoringCriteria.resolve("KTAS-1", ktasCardiac)?.id)
        assertNull(ScoringCriteria.resolve("ESI-2", esiSepsis), "two ESI Level 2 criteria")
        assertNull(ScoringCriteria.resolve("CPR", ktasCardiac), "four CPR criteria")
    }

    @Test
    fun rejectsWhatTheSessionDidNotOffer() {
        assertNull(ScoringCriteria.resolve("KTAS-2-EMERGENT", esiSepsis), "other triage system")
        assertNull(ScoringCriteria.resolve("BURNS-COOLING", esiSepsis), "other scenario's protocol")
        assertNull(ScoringCriteria.resolve("ESI-6-MADE-UP", esiSepsis), "doesn't exist")
        assertNull(ScoringCriteria.resolve("Surviving Sepsis Campaign 2021, section 4", esiSepsis), "prose, not an ID")
        assertNull(ScoringCriteria.resolve(ScoringCriteria.UNCITED, esiSepsis))
        assertNull(ScoringCriteria.resolve("", esiSepsis))
        assertNull(ScoringCriteria.resolve(null, esiSepsis))
    }
}
