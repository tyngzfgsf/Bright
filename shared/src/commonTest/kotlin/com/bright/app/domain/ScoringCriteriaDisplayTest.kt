package com.bright.app.domain

import com.bright.app.domain.model.ScoringCriteria
import com.bright.app.domain.model.textRes
import kotlin.test.Test
import kotlin.test.assertNotNull

class ScoringCriteriaDisplayTest {

    @Test
    fun everyCriterionHasDisplayText() {
        for (criterion in ScoringCriteria.all) {
            assertNotNull(criterion.textRes, "no string resource for ${criterion.id}")
        }
    }
}
